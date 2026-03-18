import * as Tone from 'tone';
import { Midi } from 'tonal';
import type { Phrase } from '../../types/music';

export class PreviewPlayback {
  private synth: Tone.PolySynth<Tone.Synth> | null = null;

  private clickSynth: Tone.MembraneSynth | null = null;

  private prepared = false;

  async prepare(): Promise<void> {
    if (this.prepared) {
      return;
    }

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
    const withMetronome = options.withMetronome ?? true;
    const secondsPerBeat = 60 / phrase.tempo;
    const now = Tone.now() + 0.05;

    phrase.events.forEach((event) => {
      const token = phrase.tokensById[event.chordTokenId];
      if (!token) {
        return;
      }

      const notes = token.midiVoicing.map((midi) => Midi.midiToNoteName(midi, { sharps: true }) ?? 'C4');
      const eventOffsetSeconds = ((event.bar - 1) * 4 + (event.beat - 1)) * secondsPerBeat;
      const eventTime = now + eventOffsetSeconds;
      const duration = Math.max(0.25, event.durationBeats * secondsPerBeat);

      this.synth?.triggerAttackRelease(notes, duration, eventTime, 0.45);
    });

    const totalBeats = Math.max(...phrase.events.map((event) => (event.bar - 1) * 4 + event.beat + event.durationBeats));

    if (withMetronome) {
      for (let beatIndex = 0; beatIndex < Math.ceil(totalBeats); beatIndex += 1) {
        const beatTime = now + beatIndex * secondsPerBeat;
        const clickPitch = beatIndex % 4 === 0 ? 'C5' : 'C4';
        this.clickSynth?.triggerAttackRelease(clickPitch, '16n', beatTime, 0.26);
      }
    }

    const waitMs = Math.ceil(totalBeats * secondsPerBeat * 1000 + 120);
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), waitMs);
    });
  }
}
