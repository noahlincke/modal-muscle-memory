import { loadTone } from './toneLoader';

const QUARTER_NOTE_EPSILON = 0.0001;
export const METRONOME_START_DELAY_SECONDS = 0.01;

interface MetronomeStartOptions {
  beatOffsetBeats?: number;
  onBeat?: (beatIndex: number) => void;
}

export function metronomePhaseForBeatOffset(beatOffsetBeats = 0): {
  nextQuarterIndex: number;
  startDelayBeats: number;
} {
  const safeOffset = Number.isFinite(beatOffsetBeats) ? Math.max(0, beatOffsetBeats) : 0;
  const nearestQuarter = Math.round(safeOffset);
  const startsOnQuarter = Math.abs(safeOffset - nearestQuarter) < QUARTER_NOTE_EPSILON;
  const nextQuarterIndex = startsOnQuarter ? nearestQuarter : Math.floor(safeOffset) + 1;

  return {
    nextQuarterIndex,
    startDelayBeats: startsOnQuarter ? 0 : nextQuarterIndex - safeOffset,
  };
}

export class Metronome {
  private synth: import('tone').MembraneSynth | null = null;

  private repeatId: number | null = null;

  private prepared = false;

  private tone: typeof import('tone') | null = null;

  async prepare(): Promise<void> {
    if (this.prepared) {
      return;
    }

    const Tone = await loadTone();
    this.tone = Tone;

    await Tone.start();
    Tone.Transport.cancel(0);
    this.synth = new Tone.MembraneSynth({
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

  async runCountIn(
    tempo: number,
    bars: number,
    onBeat?: (beatIndex: number) => void,
  ): Promise<void> {
    await this.prepare();
    const Tone = this.tone;
    if (!Tone) {
      return;
    }

    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    Tone.Transport.bpm.value = tempo;

    const totalBeats = bars * 4;

    return new Promise<void>((resolve) => {
      let beat = 0;
      this.repeatId = Tone.Transport.scheduleRepeat((time) => {
        beat += 1;
        this.synth?.triggerAttackRelease(beat % 4 === 1 ? 'C4' : 'C3', '16n', time);
        onBeat?.(beat);
        if (beat >= totalBeats) {
          if (this.repeatId !== null) {
            Tone.Transport.clear(this.repeatId);
            this.repeatId = null;
          }
          Tone.Transport.stop();
          resolve();
        }
      }, '4n');

      Tone.Transport.start(`+${METRONOME_START_DELAY_SECONDS}`);
    });
  }

  async start(tempo: number, options: MetronomeStartOptions = {}): Promise<void> {
    await this.prepare();
    const Tone = this.tone;
    if (!Tone) {
      return;
    }

    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    Tone.Transport.bpm.value = tempo;

    const { nextQuarterIndex, startDelayBeats } = metronomePhaseForBeatOffset(options.beatOffsetBeats);
    let quarterIndex = nextQuarterIndex;
    this.repeatId = Tone.Transport.scheduleRepeat((time) => {
      this.synth?.triggerAttackRelease(quarterIndex % 4 === 0 ? 'C4' : 'C3', '16n', time);
      options.onBeat?.(quarterIndex + 1);
      quarterIndex += 1;
    }, '4n', (startDelayBeats * 60) / tempo);

    Tone.Transport.start(`+${METRONOME_START_DELAY_SECONDS}`);
  }

  setTempo(tempo: number): void {
    if (this.tone) {
      this.tone.Transport.bpm.value = tempo;
    }
  }

  stop(): void {
    const Tone = this.tone;
    if (!Tone) {
      return;
    }

    if (this.repeatId !== null) {
      Tone.Transport.clear(this.repeatId);
      this.repeatId = null;
    }
    Tone.Transport.stop();
  }
}
