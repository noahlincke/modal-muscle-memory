import { Midi } from 'tonal';
import type { InputNode } from 'tone';
import { loadTone } from './toneLoader';

export type InstrumentId = 'upright' | 'grand' | 'epiano' | 'synth';

export interface InstrumentInfo {
  id: InstrumentId;
  label: string;
  description: string;
}

export const INSTRUMENTS: ReadonlyArray<InstrumentInfo> = [
  {
    id: 'upright',
    label: 'Upright',
    description: 'Warm acoustic upright piano',
  },
  {
    id: 'grand',
    label: 'Grand',
    description: 'Concert grand piano',
  },
  {
    id: 'epiano',
    label: 'E-Piano',
    description: 'Rhodes-style electric piano',
  },
  {
    id: 'synth',
    label: 'Synth',
    description: 'Built-in synth (no download)',
  },
];

export const DEFAULT_INSTRUMENT: InstrumentId = 'upright';

/** Map a 0..1 volume setting to decibels for Tone.Volume nodes (0 is inaudible, 1 is unity). */
export function volumeToDb(volume: number): number {
  if (!Number.isFinite(volume) || volume <= 0) {
    return -60;
  }
  return 20 * Math.log10(Math.min(1, volume));
}

/**
 * Sample coverage per instrument: one MP3 every 3 semitones named by MIDI note
 * number under `public/sounds/<id>/`. These ranges must stay in sync with
 * scripts/build-sounds.mjs, which renders the assets.
 */
const SAMPLE_SPECS: { [id in Exclude<InstrumentId, 'synth'>]: { lowMidi: number; highMidi: number; release: number } } = {
  upright: { lowMidi: 21, highMidi: 108, release: 1.2 },
  grand: { lowMidi: 21, highMidi: 108, release: 1.2 },
  epiano: { lowMidi: 30, highMidi: 96, release: 0.8 },
};

/**
 * MIDI note numbers backed by sample files for an instrument (empty for synth).
 */
export function sampleNotes(id: InstrumentId): number[] {
  const spec = SAMPLE_SPECS[id as Exclude<InstrumentId, 'synth'>];
  if (!spec) {
    return [];
  }
  const notes: number[] = [];
  for (let midi = spec.lowMidi; midi <= spec.highMidi; midi += 3) {
    notes.push(midi);
  }
  return notes;
}

export interface InstrumentPlayer {
  readonly id: InstrumentId;
  /** Resolves when the instrument can play samples (or the synth voice, for synth). */
  readonly loaded: Promise<void>;
  /** velocity: 0..1, time: Tone time (defaults to now). */
  noteOn(midi: number, velocity?: number, time?: number): void;
  noteOff(midi: number, time?: number): void;
  /** While sustain is on, noteOff defers the release until sustain turns off (MIDI CC64). */
  setSustain(on: boolean): void;
  releaseAll(): void;
  setVolume(db: number): void;
  dispose(): void;
}

/** Fallback voice used until samples are loaded, so the first touch is never silent. */
const FALLBACK_SYNTH_OPTIONS = {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.01, decay: 0.4, sustain: 0.12, release: 0.9 },
} as const;

const DEFAULT_VELOCITY = 0.7;

type Voice = {
  triggerAttack(notes: string, time?: number, velocity?: number): void;
  triggerRelease(notes: string, time?: number): void;
  releaseAll(time?: number): void;
};

function noteName(midi: number): string {
  return Midi.midiToNoteName(midi, { sharps: true }) ?? 'C4';
}

class ToneInstrument implements InstrumentPlayer {
  readonly id: InstrumentId;

  readonly loaded: Promise<void>;

  private readonly baseUrl: string;

  private readonly destination: InputNode | undefined;

  private initPromise: Promise<void> | null = null;

  private out: import('tone').Volume | null = null;

  private synth: (import('tone').PolySynth<import('tone').Synth> & Voice) | null = null;

  private sampler: (import('tone').Sampler & Voice) | null = null;

  private samplerReady = false;

  /** Commands queued until the fallback voice exists. */
  private queue: Array<() => void> = [];

  private volumeDb = 0;

  private sustainOn = false;

  /** midi -> velocity for currently held keys. */
  private held = new Map<number, number>();

  /** Notes released while the sustain pedal was down, still sounding. */
  private sustained = new Set<number>();

  /** Which voice is currently sounding each note. */
  private activeVoice = new Map<number, Voice>();

  constructor(id: InstrumentId, opts: { baseUrl: string; destination?: InputNode }) {
    this.id = id;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.destination = opts.destination;
    this.loaded = this.init();
  }

  private hasSamples(): boolean {
    return this.id !== 'synth';
  }

  /**
   * Load Tone, build the fallback synth first (so queued first touches play),
   * then build the sample sampler on top. Safe to call repeatedly.
   */
  private init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit();
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const Tone = await loadTone();

    this.out = new Tone.Volume(this.volumeDb);
    if (this.destination) {
      this.out.connect(this.destination);
    } else {
      this.out.toDestination();
    }

    this.synth = new Tone.PolySynth(Tone.Synth, FALLBACK_SYNTH_OPTIONS).connect(this.out);
    this.drainQueue();

    if (this.hasSamples()) {
      const spec = SAMPLE_SPECS[this.id as Exclude<InstrumentId, 'synth'>];
      const urls: Record<string, string> = {};
      for (const midi of sampleNotes(this.id)) {
        urls[noteName(midi)] = `${this.baseUrl}/sounds/${this.id}/${midi}.mp3`;
      }
      let built: (import('tone').Sampler & Voice) | null = null;
      await new Promise<void>((resolve) => {
        built = new Tone.Sampler({ urls, release: spec.release, onload: resolve });
      });
      this.sampler = built;
      this.samplerReady = this.sampler !== null;
    }
  }

  private enqueue(command: () => void): void {
    if (this.synth) {
      command();
    } else {
      this.queue.push(command);
    }
  }

  private drainQueue(): void {
    const pending = this.queue;
    this.queue = [];
    pending.forEach((command) => command());
  }

  private pickVoice(): Voice {
    if (this.samplerReady && this.sampler) {
      return this.sampler;
    }
    // Only reachable once the fallback voice exists (commands run via enqueue).
    return this.synth as Voice;
  }

  // Audio unlock lives in audioUnlock (it must run synchronously inside the
  // user gesture); notes scheduled on a suspended context start when it runs.
  noteOn(midi: number, velocity: number = DEFAULT_VELOCITY, time?: number): void {
    this.held.set(midi, velocity);
    this.enqueue(() => {
      if (!this.held.has(midi) && !this.sustained.has(midi)) {
        return;
      }
      const voice = this.pickVoice();
      this.activeVoice.set(midi, voice);
      voice.triggerAttack(noteName(midi), time, velocity);
    });
  }

  noteOff(midi: number, time?: number): void {
    this.held.delete(midi);
    if (this.sustainOn) {
      this.sustained.add(midi);
      return;
    }
    this.enqueue(() => {
      if (this.sustained.has(midi) || this.held.has(midi)) {
        return;
      }
      this.activeVoice.get(midi)?.triggerRelease(noteName(midi), time);
      this.activeVoice.delete(midi);
    });
  }

  setSustain(on: boolean): void {
    this.sustainOn = on;
    if (on) {
      return;
    }
    const toRelease = [...this.sustained];
    this.sustained.clear();
    for (const midi of toRelease) {
      this.enqueue(() => {
        if (this.held.has(midi)) {
          return;
        }
        this.activeVoice.get(midi)?.triggerRelease(noteName(midi));
        this.activeVoice.delete(midi);
      });
    }
  }

  releaseAll(): void {
    this.held.clear();
    this.sustained.clear();
    this.activeVoice.clear();
    this.enqueue(() => {
      this.synth?.releaseAll();
      this.sampler?.releaseAll();
    });
  }

  setVolume(db: number): void {
    this.volumeDb = db;
    if (this.out) {
      this.out.volume.value = db;
    }
  }

  dispose(): void {
    this.queue = [];
    this.held.clear();
    this.sustained.clear();
    this.activeVoice.clear();
    void this.init().then(() => {
      this.synth?.dispose();
      this.synth = null;
      this.sampler?.dispose();
      this.sampler = null;
      this.samplerReady = false;
      this.out?.dispose();
      this.out = null;
    });
  }
}

/**
 * Create a player for an instrument. Sampled instruments stream their MP3s
 * from `<baseUrl>sounds/<id>/` (pass `import.meta.env.BASE_URL`); until they
 * arrive, notes fall through to the built-in synth voice.
 */
export function createInstrument(
  id: InstrumentId,
  opts: { baseUrl: string; destination?: InputNode },
): InstrumentPlayer {
  return new ToneInstrument(id, opts);
}
