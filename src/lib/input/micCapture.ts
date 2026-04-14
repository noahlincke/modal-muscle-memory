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
  reason: 'required_detected';
}

interface MicCaptureOptions {
  stabilityFrames?: number;
  pitchToleranceSemitones?: number;
  minClarity?: number;
  minRms?: number;
  noteReleaseMs?: number;
  retriggerMs?: number;
  historyWindowMs?: number;
}

interface MicIngestResult {
  stableEvent: MicStablePitchEvent | null;
  activeChanged: boolean;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function frequencyToMidiNumber(frequency: number): number {
  return 69 + (12 * Math.log2(frequency / 440));
}

export class MicCapture {
  activeNoteNumbers = new Set<number>();

  private readonly stabilityFrames: number;

  private readonly pitchToleranceSemitones: number;

  private readonly minClarity: number;

  private readonly minRms: number;

  private readonly noteReleaseMs: number;

  private readonly retriggerMs: number;

  private readonly historyWindowMs: number;

  private candidateNoteNumber: number | null = null;

  private candidateStableFrames = 0;

  private lastStableEvent: MicStablePitchEvent | null = null;

  private recentStableEvents: MicStablePitchEvent[] = [];

  private lastSubmissionSignature: string | null = null;

  constructor(options: MicCaptureOptions = {}) {
    this.stabilityFrames = options.stabilityFrames ?? 1;
    this.pitchToleranceSemitones = options.pitchToleranceSemitones ?? 0.6;
    this.minClarity = options.minClarity ?? 0.72;
    this.minRms = options.minRms ?? 0.008;
    this.noteReleaseMs = options.noteReleaseMs ?? 65;
    this.retriggerMs = options.retriggerMs ?? 20;
    this.historyWindowMs = options.historyWindowMs ?? 420;
  }

  ingest(observation: PitchObservation): MicIngestResult {
    this.pruneHistory(observation.timestamp);

    if (
      observation.frequency === null
      || observation.clarity < this.minClarity
      || observation.rms < this.minRms
    ) {
      return {
        stableEvent: null,
        activeChanged: this.releaseIfExpired(observation.timestamp),
      };
    }

    const midiNumber = frequencyToMidiNumber(observation.frequency);
    const roundedMidi = Math.round(midiNumber);
    if (Math.abs(midiNumber - roundedMidi) > this.pitchToleranceSemitones) {
      return {
        stableEvent: null,
        activeChanged: this.releaseIfExpired(observation.timestamp),
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
      };
    }

    if (
      this.lastStableEvent
      && this.lastStableEvent.noteNumber === roundedMidi
      && (observation.timestamp - this.lastStableEvent.timestamp) < this.retriggerMs
    ) {
      return {
        stableEvent: null,
        activeChanged,
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
    this.recentStableEvents = [...this.recentStableEvents, stableEvent];

    return {
      stableEvent,
      activeChanged,
    };
  }

  maybeBuildSubmission(
    requiredPitchClasses: string[],
    now: number,
  ): MicChordSubmission | null {
    this.pruneHistory(now);

    if (requiredPitchClasses.length === 0 || this.recentStableEvents.length === 0) {
      return null;
    }

    const pitchClasses = unique(this.recentStableEvents.map((event) => event.pitchClass));
    const containsRequired = requiredPitchClasses.some((pitchClass) => pitchClasses.includes(pitchClass));
    if (!containsRequired) {
      return null;
    }

    const signature = pitchClasses.join(',');
    if (signature === this.lastSubmissionSignature) {
      return null;
    }

    this.lastSubmissionSignature = signature;

    return {
      notes: unique(this.recentStableEvents.map((event) => event.noteNumber)).sort((a, b) => a - b),
      pitchClasses,
      timestamp: this.recentStableEvents[this.recentStableEvents.length - 1]?.timestamp ?? now,
      reason: 'required_detected',
    };
  }

  clearRecent(): void {
    this.recentStableEvents = [];
    this.lastSubmissionSignature = null;
  }

  clear(): void {
    this.activeNoteNumbers.clear();
    this.candidateNoteNumber = null;
    this.candidateStableFrames = 0;
    this.lastStableEvent = null;
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

  private pruneHistory(now: number): void {
    this.recentStableEvents = this.recentStableEvents.filter(
      (event) => (now - event.timestamp) <= this.historyWindowMs,
    );

    if (this.recentStableEvents.length === 0) {
      this.lastSubmissionSignature = null;
    }
  }
}
