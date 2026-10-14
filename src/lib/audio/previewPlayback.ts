import type { Phrase, ScalePrompt } from '../../types/music';
import type { InstrumentPlayer } from './instruments';
import { clickPitchForBeat } from './metronome';
import { loadTone } from './toneLoader';

const START_DELAY_SECONDS = 0.05;

const REFERENCE_VELOCITY = 0.45;

const INPUT_VELOCITY = 0.42;

const CLICK_VELOCITY = 0.26;

/**
 * Reference playback (phrases, scale prompts, preview clicks) plus the facade for
 * echoing the user's own notes. Note audio comes from the shared InstrumentPlayer
 * attached via setInstrumentPlayer; only the click voice is owned here.
 */
export class PreviewPlayback {
  private instrumentPlayer: InstrumentPlayer | null = null;

  private clickSynth: import('tone').MembraneSynth | null = null;

  private clickOut: import('tone').Volume | null = null;

  private clickVolumeDb = 0;

  private preparePromise: Promise<void> | null = null;

  private tone: typeof import('tone') | null = null;

  private runId = 0;

  private transportEventIds: number[] = [];

  private completionTimeoutId: number | null = null;

  private pendingResolve: (() => void) | null = null;

  private activeInputNotes = new Set<number>();

  /** Attach the app-wide instrument player (user notes and reference share one voice). */
  setInstrumentPlayer(player: InstrumentPlayer | null): void {
    this.instrumentPlayer = player;
  }

  setSustain(on: boolean): void {
    this.instrumentPlayer?.setSustain(on);
  }

  setClickVolume(db: number): void {
    this.clickVolumeDb = db;
    if (this.clickOut) {
      this.clickOut.volume.value = db;
    }
  }

  /** Single in-flight prepare: concurrent first uses share one promise and one click voice. */
  private prepare(): Promise<void> {
    if (!this.preparePromise) {
      this.preparePromise = this.doPrepare();
    }
    return this.preparePromise;
  }

  private async doPrepare(): Promise<void> {
    // Context unlock is handled synchronously by audioUnlock in the gesture
    // path; clicks scheduled while suspended start once the context runs.
    const Tone = await loadTone();
    this.tone = Tone;
    this.clickOut = new Tone.Volume(this.clickVolumeDb).toDestination();
    this.clickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 2,
      envelope: {
        attack: 0.001,
        decay: 0.12,
        sustain: 0,
        release: 0.02,
      },
    }).connect(this.clickOut);
  }

  playInputNote(noteNumber: number, velocity: number = INPUT_VELOCITY): void {
    const player = this.instrumentPlayer;
    if (!player || this.activeInputNotes.has(noteNumber)) {
      return;
    }

    this.activeInputNotes.add(noteNumber);
    player.noteOn(noteNumber, velocity);
  }

  releaseInputNote(noteNumber: number): void {
    if (!this.activeInputNotes.has(noteNumber)) {
      return;
    }

    this.activeInputNotes.delete(noteNumber);
    this.instrumentPlayer?.noteOff(noteNumber);
  }

  stopInputNotes(): void {
    const notes = [...this.activeInputNotes];
    this.activeInputNotes.clear();
    for (const midi of notes) {
      this.instrumentPlayer?.noteOff(midi);
    }
  }

  async playPhrase(
    phrase: Phrase,
    options: {
      withMetronome?: boolean;
    } = {},
  ): Promise<void> {
    await this.prepare();
    const player = this.instrumentPlayer;
    const Tone = this.tone;
    if (!player || !Tone) {
      return;
    }
    this.stop();

    const withMetronome = options.withMetronome ?? true;
    const secondsPerBeat = 60 / phrase.tempo;
    const runId = this.runId;

    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    Tone.Transport.bpm.value = phrase.tempo;

    const schedule = (offsetSeconds: number, run: (time: number) => void): void => {
      this.transportEventIds.push(Tone.Transport.schedule((time) => {
        if (this.runId !== runId) {
          return;
        }
        run(time);
      }, offsetSeconds));
    };

    const totalBeats = Math.max(...phrase.events.map((event) => (event.bar - 1) * 4 + event.beat + event.durationBeats));

    phrase.events.forEach((event) => {
      const token = phrase.tokensById[event.chordTokenId];
      if (!token) {
        return;
      }

      const startOffset = ((event.bar - 1) * 4 + (event.beat - 1)) * secondsPerBeat;
      const duration = Math.max(0.25, event.durationBeats * secondsPerBeat);
      const notes = token.midiVoicing;

      schedule(startOffset, (time) => {
        for (const midi of notes) {
          player.noteOn(midi, REFERENCE_VELOCITY, time);
        }
      });
      schedule(startOffset + duration, (time) => {
        for (const midi of notes) {
          player.noteOff(midi, time);
        }
      });
    });

    if (withMetronome) {
      for (let beatIndex = 0; beatIndex < Math.ceil(totalBeats); beatIndex += 1) {
        schedule(beatIndex * secondsPerBeat, (time) => {
          this.clickSynth?.triggerAttackRelease(clickPitchForBeat(beatIndex), '16n', time, CLICK_VELOCITY);
        });
      }
    }

    Tone.Transport.start();
    this.awaitCompletion(Tone, runId, totalBeats * secondsPerBeat);
  }

  async playScalePrompt(
    prompt: ScalePrompt,
    options: {
      tempo?: number;
    } = {},
  ): Promise<void> {
    await this.prepare();
    const player = this.instrumentPlayer;
    const Tone = this.tone;
    if (!player || !Tone) {
      return;
    }
    this.stop();

    const secondsPerBeat = 60 / (options.tempo ?? 96);
    const noteDuration = Math.max(0.18, secondsPerBeat * 0.82);
    const runId = this.runId;

    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    Tone.Transport.bpm.value = options.tempo ?? 96;

    prompt.noteSequence.forEach((note, index) => {
      const startOffset = index * secondsPerBeat;
      const midi = note.midi;
      this.transportEventIds.push(Tone.Transport.schedule((time) => {
        if (this.runId !== runId) {
          return;
        }
        player.noteOn(midi, REFERENCE_VELOCITY, time);
        player.noteOff(midi, time + noteDuration);
      }, startOffset));
    });

    Tone.Transport.start();
    this.awaitCompletion(Tone, runId, prompt.noteSequence.length * secondsPerBeat);
  }

  stop(): void {
    this.runId += 1;

    const Tone = this.tone;
    if (Tone) {
      for (const eventId of this.transportEventIds) {
        Tone.Transport.clear(eventId);
      }
    }
    this.transportEventIds = [];

    if (this.completionTimeoutId !== null) {
      window.clearTimeout(this.completionTimeoutId);
      this.completionTimeoutId = null;
    }

    this.activeInputNotes.clear();
    this.instrumentPlayer?.releaseAll();
    this.clickSynth?.triggerRelease();

    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      resolve();
    }
  }

  /**
   * Resolve when the Transport reaches the end of the run. The Transport callback
   * is the precise clock; the timeout is only a safety net for a Transport wiped
   * by another owner (e.g. the metronome restarting mid-run).
   */
  private awaitCompletion(Tone: typeof import('tone'), runId: number, durationSeconds: number): void {
    this.transportEventIds.push(Tone.Transport.schedule(() => {
      if (this.runId !== runId) {
        return;
      }
      this.finishRun();
    }, durationSeconds));

    const waitMs = Math.ceil(START_DELAY_SECONDS * 1000 + durationSeconds * 1000 + 1200);
    this.completionTimeoutId = window.setTimeout(() => {
      if (this.runId !== runId) {
        return;
      }
      this.finishRun();
    }, waitMs);
  }

  private finishRun(): void {
    this.runId += 1;
    this.transportEventIds = [];
    if (this.completionTimeoutId !== null) {
      window.clearTimeout(this.completionTimeoutId);
      this.completionTimeoutId = null;
    }
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    resolve?.();
  }
}
