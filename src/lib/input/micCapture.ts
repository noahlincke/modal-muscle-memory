import type { PitchObservation } from '../audio/pitchDetection';
import { midiToPitchClass } from '../theory/noteUtils';

export interface MicStablePitchEvent {
  noteNumber: number;
  pitchClass: string;
  timestamp: number;
  clarity: number;
  rms: number;
}

export interface MicChordSubmission {
  notes: number[];
  pitchClasses: string[];
  timestamp: number;
  reason: 'required_detected' | 'burst_closed';
}

export interface MicCaptureDebugEvent {
  type:
    | 'chord_burst_started'
    | 'chord_stable_event'
    | 'chord_submission_accepted'
    | 'chord_submission_rejected';
  timestamp: number;
  payload: Record<string, unknown>;
}

interface MicCaptureOptions {
  stabilityFrames?: number;
  scalePitchToleranceSemitones?: number;
  scaleMinClarity?: number;
  scaleMinRms?: number;
  chordPitchToleranceSemitones?: number;
  chordMinClarity?: number;
  chordMinRms?: number;
  noteReleaseMs?: number;
  scaleRetriggerMs?: number;
  chordRetriggerMs?: number;
  burstMinRms?: number;
  burstRiseRms?: number;
  burstContinueRms?: number;
  burstGapMs?: number;
  burstMaxMs?: number;
  chordSubmissionCooldownMs?: number;
  chordQuietResetHoldMs?: number;
  chordQuietResetRms?: number;
  chordReattackRiseRms?: number;
  chordStrongClarity?: number;
  chordSinglePitchAcceptanceClarity?: number;
  chordSinglePitchAcceptancePeakRms?: number;
}

interface MicIngestResult {
  stableEvent: MicStablePitchEvent | null;
  activeChanged: boolean;
  submission: MicChordSubmission | null;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function frequencyToMidiNumber(frequency: number): number {
  return 69 + (12 * Math.log2(frequency / 440));
}

export class MicCapture {
  activeNoteNumbers = new Set<number>();

  private debugLogger: ((event: MicCaptureDebugEvent) => void) | null = null;

  private readonly stabilityFrames: number;

  private readonly scalePitchToleranceSemitones: number;

  private readonly scaleMinClarity: number;

  private readonly scaleMinRms: number;

  private readonly chordPitchToleranceSemitones: number;

  private readonly chordMinClarity: number;

  private readonly chordMinRms: number;

  private readonly noteReleaseMs: number;

  private readonly scaleRetriggerMs: number;

  private readonly chordRetriggerMs: number;

  private readonly burstMinRms: number;

  private readonly burstRiseRms: number;

  private readonly burstContinueRms: number;

  private readonly burstGapMs: number;

  private readonly burstMaxMs: number;

  private readonly chordSubmissionCooldownMs: number;

  private readonly chordQuietResetHoldMs: number;

  private readonly chordQuietResetRms: number;

  private readonly chordReattackRiseRms: number;

  private readonly chordStrongClarity: number;

  private readonly chordSinglePitchAcceptanceClarity: number;

  private readonly chordSinglePitchAcceptancePeakRms: number;

  private candidateNoteNumber: number | null = null;

  private candidateStableFrames = 0;

  private lastStableEvent: MicStablePitchEvent | null = null;

  private rmsBaseline = 0;

  private lastObservedRms = 0;

  private burstStartedAt: number | null = null;

  private burstLastActivityAt = 0;

  private burstStableEvents: MicStablePitchEvent[] = [];

  private lastBurstSubmittedAt = Number.NEGATIVE_INFINITY;

  private burstPeakRms = 0;

  private quietResetStartedAt: number | null = null;

  private postSubmissionFloorRms = Number.POSITIVE_INFINITY;

  constructor(options: MicCaptureOptions = {}) {
    this.stabilityFrames = options.stabilityFrames ?? 1;
    this.scalePitchToleranceSemitones = options.scalePitchToleranceSemitones ?? 1.08;
    this.scaleMinClarity = options.scaleMinClarity ?? 0.48;
    this.scaleMinRms = options.scaleMinRms ?? 0.0022;
    this.chordPitchToleranceSemitones = options.chordPitchToleranceSemitones ?? 0.62;
    this.chordMinClarity = options.chordMinClarity ?? 0.7;
    this.chordMinRms = options.chordMinRms ?? 0.0058;
    this.noteReleaseMs = options.noteReleaseMs ?? 65;
    this.scaleRetriggerMs = options.scaleRetriggerMs ?? 6;
    this.chordRetriggerMs = options.chordRetriggerMs ?? 22;
    this.burstMinRms = options.burstMinRms ?? 0.0061;
    this.burstRiseRms = options.burstRiseRms ?? 0.0034;
    this.burstContinueRms = options.burstContinueRms ?? 0.0049;
    this.burstGapMs = options.burstGapMs ?? 120;
    this.burstMaxMs = options.burstMaxMs ?? 180;
    this.chordSubmissionCooldownMs = options.chordSubmissionCooldownMs ?? 300;
    this.chordQuietResetHoldMs = options.chordQuietResetHoldMs ?? 140;
    this.chordQuietResetRms = options.chordQuietResetRms ?? 0.0024;
    this.chordReattackRiseRms = options.chordReattackRiseRms ?? 0.0031;
    this.chordStrongClarity = options.chordStrongClarity ?? 0.76;
    this.chordSinglePitchAcceptanceClarity = options.chordSinglePitchAcceptanceClarity ?? 0.9;
    this.chordSinglePitchAcceptancePeakRms = options.chordSinglePitchAcceptancePeakRms ?? 0.0125;
  }

  setDebugLogger(logger: ((event: MicCaptureDebugEvent) => void) | null): void {
    this.debugLogger = logger;
  }

  ingestScale(
    observation: PitchObservation,
  ): MicIngestResult {
    return this.ingestInternal(observation, {
      minClarity: this.scaleMinClarity,
      minRms: this.scaleMinRms,
      pitchToleranceSemitones: this.scalePitchToleranceSemitones,
      retriggerMs: this.scaleRetriggerMs,
    });
  }

  ingestChord(
    observation: PitchObservation,
    requiredPitchClasses: string[] = [],
  ): MicIngestResult {
    this.maybeStartBurst(observation);

    const result = this.ingestInternal(observation, {
      minClarity: this.chordMinClarity,
      minRms: this.chordMinRms,
      pitchToleranceSemitones: this.chordPitchToleranceSemitones,
      retriggerMs: this.chordRetriggerMs,
    });
    const submission = this.maybeFinalizeBurst(observation.timestamp, requiredPitchClasses);
    this.updateBurstEnvelope(observation);
    this.updateQuietResetState(observation);
    this.updateRmsBaseline(observation.rms);

    return {
      ...result,
      submission,
    };
  }

  private ingestInternal(
    observation: PitchObservation,
    profile: {
      minClarity: number;
      minRms: number;
      pitchToleranceSemitones: number;
      retriggerMs: number;
    },
  ): MicIngestResult {
    if (
      observation.frequency === null
      || observation.clarity < profile.minClarity
      || observation.rms < profile.minRms
    ) {
      return {
        stableEvent: null,
        activeChanged: this.releaseIfExpired(observation.timestamp),
        submission: null,
      };
    }

    const midiNumber = frequencyToMidiNumber(observation.frequency);
    const roundedMidi = Math.round(midiNumber);
    if (Math.abs(midiNumber - roundedMidi) > profile.pitchToleranceSemitones) {
      return {
        stableEvent: null,
        activeChanged: this.releaseIfExpired(observation.timestamp),
        submission: null,
      };
    }

    if (this.candidateNoteNumber === roundedMidi) {
      this.candidateStableFrames += 1;
    } else {
      this.candidateNoteNumber = roundedMidi;
      this.candidateStableFrames = 1;
    }

    const activeChanged = !this.activeNoteNumbers.has(roundedMidi) || this.activeNoteNumbers.size !== 1;
    this.activeNoteNumbers = new Set([roundedMidi]);

    if (this.candidateStableFrames < this.stabilityFrames) {
      return {
        stableEvent: null,
        activeChanged,
        submission: null,
      };
    }

    if (
      this.lastStableEvent
      && this.lastStableEvent.noteNumber === roundedMidi
      && (observation.timestamp - this.lastStableEvent.timestamp) < profile.retriggerMs
    ) {
      return {
        stableEvent: null,
        activeChanged,
        submission: null,
      };
    }

    const stableEvent: MicStablePitchEvent = {
      noteNumber: roundedMidi,
      pitchClass: midiToPitchClass(roundedMidi),
      timestamp: observation.timestamp,
      clarity: observation.clarity,
      rms: observation.rms,
    };

    this.lastStableEvent = stableEvent;
    if (this.burstStartedAt !== null) {
      this.burstStableEvents = [...this.burstStableEvents, stableEvent];
      this.emitDebug('chord_stable_event', stableEvent.timestamp, {
        noteNumber: stableEvent.noteNumber,
        pitchClass: stableEvent.pitchClass,
        clarity: stableEvent.clarity,
        rms: stableEvent.rms,
        burstEventCount: this.burstStableEvents.length,
      });
    }

    return {
      stableEvent,
      activeChanged,
      submission: null,
    };
  }

  clearRecent(): void {
    this.burstStartedAt = null;
    this.burstLastActivityAt = 0;
    this.burstStableEvents = [];
  }

  clear(): void {
    this.activeNoteNumbers.clear();
    this.candidateNoteNumber = null;
    this.candidateStableFrames = 0;
    this.lastStableEvent = null;
    this.rmsBaseline = 0;
    this.lastObservedRms = 0;
    this.lastBurstSubmittedAt = Number.NEGATIVE_INFINITY;
    this.burstPeakRms = 0;
    this.quietResetStartedAt = null;
    this.postSubmissionFloorRms = Number.POSITIVE_INFINITY;
    this.clearRecent();
  }

  private releaseIfExpired(now: number): boolean {
    if (
      this.lastStableEvent
      && (now - this.lastStableEvent.timestamp) < this.noteReleaseMs
    ) {
      return false;
    }

    this.candidateNoteNumber = null;
    this.candidateStableFrames = 0;

    if (this.activeNoteNumbers.size === 0) {
      return false;
    }

    this.activeNoteNumbers.clear();
    return true;
  }
  private maybeStartBurst(observation: PitchObservation): void {
    if (this.burstStartedAt !== null) {
      return;
    }

    if ((observation.timestamp - this.lastBurstSubmittedAt) < this.chordSubmissionCooldownMs) {
      return;
    }

    if (this.lastBurstSubmittedAt !== Number.NEGATIVE_INFINITY) {
      const hasQuietReset = this.quietResetStartedAt !== null
        && (observation.timestamp - this.quietResetStartedAt) >= this.chordQuietResetHoldMs;
      const hasFreshRiseFromFloor = Number.isFinite(this.postSubmissionFloorRms)
        && observation.rms >= (this.postSubmissionFloorRms + this.chordReattackRiseRms);

      if (!hasQuietReset && !hasFreshRiseFromFloor) {
        return;
      }
    }

    const relativeFloor = this.rmsBaseline + this.burstRiseRms;
    const risingEnough = observation.rms >= (this.lastObservedRms + this.burstRiseRms);

    if (
      observation.rms >= this.burstMinRms
      && observation.rms >= relativeFloor
      && risingEnough
    ) {
      this.burstStartedAt = observation.timestamp;
      this.burstLastActivityAt = observation.timestamp;
      this.burstStableEvents = [];
      this.burstPeakRms = observation.rms;
      this.quietResetStartedAt = null;
      this.postSubmissionFloorRms = Number.POSITIVE_INFINITY;
      this.emitDebug('chord_burst_started', observation.timestamp, {
        rms: observation.rms,
        baselineRms: this.rmsBaseline,
        lastObservedRms: this.lastObservedRms,
        relativeFloor,
      });
    }
  }

  private updateBurstEnvelope(observation: PitchObservation): void {
    if (this.burstStartedAt !== null) {
      this.burstPeakRms = Math.max(this.burstPeakRms, observation.rms);

      if (observation.rms >= Math.max(this.burstContinueRms, this.rmsBaseline + 0.0007)) {
        this.burstLastActivityAt = observation.timestamp;
      }
    }

    this.lastObservedRms = observation.rms;
  }

  private updateRmsBaseline(rms: number): void {
    const nextBaseline = this.rmsBaseline === 0
      ? rms
      : (this.rmsBaseline * (this.burstStartedAt === null ? 0.92 : 0.985)) + (rms * (this.burstStartedAt === null ? 0.08 : 0.015));
    this.rmsBaseline = Math.max(0, nextBaseline);
  }

  private maybeFinalizeBurst(
    now: number,
    requiredPitchClasses: string[],
  ): MicChordSubmission | null {
    if (this.burstStartedAt === null) {
      return null;
    }

    const idleMs = now - this.burstLastActivityAt;
    const elapsedMs = now - this.burstStartedAt;
    if (idleMs < this.burstGapMs && elapsedMs < this.burstMaxMs) {
      return null;
    }

    const pitchClasses = unique(this.burstStableEvents.map((event) => event.pitchClass));
    const notes = unique(this.burstStableEvents.map((event) => event.noteNumber)).sort((a, b) => a - b);
    const containsRequired = requiredPitchClasses.length === 0
      ? pitchClasses.length > 0
      : requiredPitchClasses.some((pitchClass) => pitchClasses.includes(pitchClass));
    const strongTonalEventCount = this.burstStableEvents.filter(
      (event) => event.clarity >= this.chordStrongClarity,
    ).length;
    const maxClarity = this.burstStableEvents.reduce(
      (highest, event) => Math.max(highest, event.clarity),
      0,
    );
    const hasEnoughSinglePitchEvidence = strongTonalEventCount >= 2
      || (
        maxClarity >= this.chordSinglePitchAcceptanceClarity
        && this.burstPeakRms >= this.chordSinglePitchAcceptancePeakRms
      );
    const hasEnoughTonalEvidence = pitchClasses.length >= 2 || hasEnoughSinglePitchEvidence;

    this.burstStartedAt = null;
    this.burstLastActivityAt = 0;
    this.burstStableEvents = [];
    this.quietResetStartedAt = null;
    this.postSubmissionFloorRms = Number.POSITIVE_INFINITY;

    if (!containsRequired || pitchClasses.length === 0 || !hasEnoughTonalEvidence) {
      this.emitDebug('chord_submission_rejected', now, {
        requiredPitchClasses,
        detectedPitchClasses: pitchClasses,
        detectedNotes: notes,
        containsRequired,
        strongTonalEventCount,
        maxClarity,
        burstPeakRms: this.burstPeakRms,
        hasEnoughSinglePitchEvidence,
        hasEnoughTonalEvidence,
        rejectionReason: !containsRequired
          ? 'no_required_pitch_class'
          : (pitchClasses.length === 0 ? 'no_pitch_classes' : 'insufficient_tonal_evidence'),
      });
      return null;
    }

    this.lastBurstSubmittedAt = now;
    this.emitDebug('chord_submission_accepted', now, {
      requiredPitchClasses,
      detectedPitchClasses: pitchClasses,
      detectedNotes: notes,
      strongTonalEventCount,
      maxClarity,
      burstPeakRms: this.burstPeakRms,
      hasEnoughSinglePitchEvidence,
    });

    return {
      notes,
      pitchClasses,
      timestamp: now,
      reason: 'burst_closed',
    };
  }

  private updateQuietResetState(observation: PitchObservation): void {
    if (this.burstStartedAt !== null) {
      this.quietResetStartedAt = null;
      return;
    }

    if (this.lastBurstSubmittedAt !== Number.NEGATIVE_INFINITY) {
      this.postSubmissionFloorRms = Math.min(this.postSubmissionFloorRms, observation.rms);
    }

    const quietThreshold = Math.max(
      this.chordQuietResetRms,
      this.rmsBaseline + 0.00015,
    );

    if (observation.rms <= quietThreshold) {
      if (this.quietResetStartedAt === null) {
        this.quietResetStartedAt = observation.timestamp;
      }
      return;
    }

    this.quietResetStartedAt = null;
  }

  private emitDebug(
    type: MicCaptureDebugEvent['type'],
    timestamp: number,
    payload: MicCaptureDebugEvent['payload'],
  ): void {
    this.debugLogger?.({ type, timestamp, payload });
  }
}
