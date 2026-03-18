import * as Tone from 'tone';

export class Metronome {
  private synth: Tone.MembraneSynth | null = null;

  private repeatId: number | null = null;

  private prepared = false;

  async prepare(): Promise<void> {
    if (this.prepared) {
      return;
    }

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

      Tone.Transport.start('+0.01');
    });
  }

  async start(tempo: number, onBeat?: (beatIndex: number) => void): Promise<void> {
    await this.prepare();
    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    Tone.Transport.bpm.value = tempo;

    let beat = 0;
    this.repeatId = Tone.Transport.scheduleRepeat((time) => {
      beat += 1;
      this.synth?.triggerAttackRelease(beat % 4 === 1 ? 'C4' : 'C3', '16n', time);
      onBeat?.(beat);
    }, '4n');

    Tone.Transport.start('+0.01');
  }

  setTempo(tempo: number): void {
    Tone.Transport.bpm.value = tempo;
  }

  stop(): void {
    if (this.repeatId !== null) {
      Tone.Transport.clear(this.repeatId);
      this.repeatId = null;
    }
    Tone.Transport.stop();
  }
}
