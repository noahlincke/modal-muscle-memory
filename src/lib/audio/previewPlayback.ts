import { Midi } from 'tonal';
import type { Phrase } from '../../types/music';
import { loadTone } from './toneLoader';

export class PreviewPlayback {
  private synth: import('tone').PolySynth<import('tone').Synth> | null = null;

  private clickSynth: import('tone').MembraneSynth | null = null;

  private prepared = false;

  private runId = 0;

  private scheduledTimeoutIds: number[] = [];

  private completionTimeoutId: number | null = null;

  private pendingResolve: (() => void) | null = null;

  async prepare(): Promise<void> {
    if (this.prepared) {
      return;
    }

    const Tone = await loadTone();
    await Tone.start();
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: 'triangle',
      },
      envelope: {
        attack: 0.02,
        decay: 0.15,
        sustain: 0.2,
        release: 0.2,
      },
    }).toDestination();

    this.clickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 2,
      envelope: {
        attack: 0.001,
        decay: 0.12,
        sustain: 0,
        release: 0.02,
      },
    }).toDestination();
    this.prepared = true;
  }

  async playPhrase(
    phrase: Phrase,
    options: {
      withMetronome?: boolean;
    } = {},
  ): Promise<void> {
    await this.prepare();
    this.stop();

    const withMetronome = options.withMetronome ?? true;
    const secondsPerBeat = 60 / phrase.tempo;
    const runId = this.runId;
    const startDelayMs = 50;

    phrase.events.forEach((event) => {
      const token = phrase.tokensById[event.chordTokenId];
      if (!token) {
        return;
      }

      const notes = token.midiVoicing.map((midi) => Midi.midiToNoteName(midi, { sharps: true }) ?? 'C4');
      const eventOffsetSeconds = ((event.bar - 1) * 4 + (event.beat - 1)) * secondsPerBeat;
      const duration = Math.max(0.25, event.durationBeats * secondsPerBeat);
      const timeoutId = window.setTimeout(() => {
        if (this.runId !== runId) {
          return;
        }
        this.synth?.triggerAttackRelease(notes, duration, undefined, 0.45);
      }, Math.max(0, Math.round(startDelayMs + eventOffsetSeconds * 1000)));
      this.scheduledTimeoutIds.push(timeoutId);
    });

    const totalBeats = Math.max(...phrase.events.map((event) => (event.bar - 1) * 4 + event.beat + event.durationBeats));

    if (withMetronome) {
      for (let beatIndex = 0; beatIndex < Math.ceil(totalBeats); beatIndex += 1) {
        const clickPitch = beatIndex % 4 === 0 ? 'C5' : 'C4';
        const timeoutId = window.setTimeout(() => {
          if (this.runId !== runId) {
            return;
          }
          this.clickSynth?.triggerAttackRelease(clickPitch, '16n', undefined, 0.26);
        }, Math.max(0, Math.round(startDelayMs + beatIndex * secondsPerBeat * 1000)));
        this.scheduledTimeoutIds.push(timeoutId);
      }
    }

    const waitMs = Math.ceil(startDelayMs + totalBeats * secondsPerBeat * 1000 + 120);
    await new Promise<void>((resolve) => {
      this.pendingResolve = resolve;
      this.completionTimeoutId = window.setTimeout(() => {
        if (this.runId !== runId) {
          resolve();
          return;
        }
        this.finishRun(resolve);
      }, waitMs);
    });
  }

  stop(): void {
    this.runId += 1;

    this.scheduledTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    this.scheduledTimeoutIds = [];

    if (this.completionTimeoutId !== null) {
      window.clearTimeout(this.completionTimeoutId);
      this.completionTimeoutId = null;
    }

    this.synth?.releaseAll();
    this.clickSynth?.triggerRelease?.();

    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      resolve();
    }
  }

  private finishRun(resolve: () => void): void {
    this.scheduledTimeoutIds = [];
    this.completionTimeoutId = null;
    this.pendingResolve = null;
    resolve();
  }
}
