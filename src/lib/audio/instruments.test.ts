import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInstrument,
  DEFAULT_INSTRUMENT,
  INSTRUMENTS,
  sampleNotes,
  type InstrumentId,
  type InstrumentPlayer,
} from './instruments';

interface VoiceCall {
  note: string;
  velocity?: number;
  time?: number;
}

interface SamplerRecord {
  urls: Record<string, string>;
  release: number;
  attacks: VoiceCall[];
  releases: VoiceCall[];
  releaseAllCalls: number;
  disposed: boolean;
  connectedTo: unknown;
  finishLoad(): void;
}

const toneState = vi.hoisted(() => {
  const state = {
    synth: {
      attacks: [] as Array<{ note: string; velocity?: number; time?: number }>,
      releases: [] as Array<{ note: string; time?: number }>,
      releaseAllCalls: 0,
      disposed: false,
      connectedTo: null as unknown,
    },
    samplers: [] as SamplerRecord[],
    volumes: [] as Array<{ value: number }>,
    outNodes: [] as Array<{ volume: { value: number } }>,
    outConnections: [] as unknown[],
    startCalls: 0,
    reset() {
      state.synth.attacks = [];
      state.synth.releases = [];
      state.synth.releaseAllCalls = 0;
      state.synth.disposed = false;
      state.synth.connectedTo = null;
      state.samplers = [];
      state.volumes = [];
      state.outNodes = [];
      state.outConnections = [];
      state.startCalls = 0;
    },
  };
  return state;
});

vi.mock('tone', () => {
  class FakeVolume {
    volume: { value: number };

    constructor(db?: number) {
      this.volume = { value: db ?? 0 };
      toneState.outNodes.push(this);
      toneState.volumes.push(this.volume);
    }

    connect(dest: unknown) {
      toneState.outConnections.push(dest);
      return this;
    }

    toDestination() {
      toneState.outConnections.push('destination');
      return this;
    }

    dispose() {}
  }

  class FakePolySynth {
    constructor() {}

    connect(dest: unknown) {
      toneState.synth.connectedTo = dest;
      return this;
    }

    triggerAttack(note: string, time?: number, velocity?: number) {
      toneState.synth.attacks.push({ note, velocity, time });
    }

    triggerRelease(note: string, time?: number) {
      toneState.synth.releases.push({ note, time });
    }

    releaseAll() {
      toneState.synth.releaseAllCalls += 1;
    }

    dispose() {
      toneState.synth.disposed = true;
    }
  }

  class FakeSampler implements SamplerRecord {
    urls: Record<string, string>;

    release: number;

    attacks: VoiceCall[] = [];

    releases: VoiceCall[] = [];

    releaseAllCalls = 0;

    disposed = false;

    connectedTo: unknown = null;

    private finish: () => void;

    constructor(options: { urls?: Record<string, string>; release?: number; onload?: () => void }) {
      this.urls = options.urls ?? {};
      this.release = options.release ?? 0;
      this.finish = () => options.onload?.();
      // Samples never resolve on their own; tests decide when loading is done.
      toneState.samplers.push(this);
    }

    connect(dest: unknown) {
      this.connectedTo = dest;
      return this;
    }

    finishLoad() {
      this.finish();
    }

    triggerAttack(note: string, time?: number, velocity?: number) {
      this.attacks.push({ note, velocity, time });
    }

    triggerRelease(note: string, time?: number) {
      this.releases.push({ note, time });
    }

    releaseAll() {
      this.releaseAllCalls += 1;
    }

    dispose() {
      this.disposed = true;
    }
  }

  return {
    start: () => {
      toneState.startCalls += 1;
      return Promise.resolve();
    },
    Synth: class {},
    Volume: FakeVolume,
    PolySynth: FakePolySynth,
    Sampler: FakeSampler,
  };
});

async function createLoaded(id: InstrumentId): Promise<InstrumentPlayer> {
  const player = createInstrument(id, { baseUrl: '/mmm/' });
  if (id !== 'synth') {
    await vi.waitFor(() => {
      expect(toneState.samplers.length).toBeGreaterThan(0);
    });
    toneState.samplers.at(-1)?.finishLoad();
  }
  await player.loaded;
  return player;
}

describe('instrument registry', () => {
  it('lists the four contract instruments', () => {
    expect(INSTRUMENTS.map((instrument) => instrument.id)).toEqual(['upright', 'grand', 'epiano', 'synth']);
  });

  it('gives every instrument a label and description', () => {
    for (const instrument of INSTRUMENTS) {
      expect(instrument.label.length).toBeGreaterThan(0);
      expect(instrument.description.length).toBeGreaterThan(0);
    }
  });

  it('defaults to the upright piano', () => {
    expect(DEFAULT_INSTRUMENT).toBe('upright');
  });
});

describe('sampleNotes', () => {
  it('covers the full piano range for the pianos', () => {
    expect(sampleNotes('upright')[0]).toBe(21);
    expect(sampleNotes('upright').at(-1)).toBe(108);
    expect(sampleNotes('grand')[0]).toBe(21);
    expect(sampleNotes('grand').at(-1)).toBe(108);
  });

  it('never leaves a gap larger than 3 semitones', () => {
    for (const id of ['upright', 'grand', 'epiano'] as const) {
      const notes = sampleNotes(id);
      for (let index = 1; index < notes.length; index += 1) {
        expect(notes[index] - notes[index - 1]).toBeLessThanOrEqual(3);
      }
    }
  });

  it('has no samples for the synth fallback', () => {
    expect(sampleNotes('synth')).toEqual([]);
  });

  it('matches the committed sample assets on disk', () => {
    // Vite enumerates the assets at transform time, so this only passes when
    // public/sounds/ actually holds one mp3 per expected note.
    const assetsByInstrument = new Map<string, Set<string>>();
    for (const key of Object.keys(import.meta.glob('/public/sounds/*/*.mp3'))) {
      const match = /\/public\/sounds\/([^/]+)\/(\d+)\.mp3$/.exec(key);
      if (!match) {
        continue;
      }
      const [, instrument, note] = match;
      if (!assetsByInstrument.has(instrument)) {
        assetsByInstrument.set(instrument, new Set());
      }
      assetsByInstrument.get(instrument)?.add(note);
    }

    for (const id of ['upright', 'grand', 'epiano'] as const) {
      const notes = sampleNotes(id);
      const files = assetsByInstrument.get(id);
      expect(files?.size, `missing mp3 assets for ${id}`).toBe(notes.length);
      for (const note of notes) {
        expect(files?.has(String(note)), `${id} is missing ${note}.mp3`).toBe(true);
      }
    }
    expect(assetsByInstrument.get('synth')).toBeUndefined();
  });
});

describe('createInstrument', () => {
  beforeEach(() => {
    toneState.reset();
  });

  it('plays and releases notes on the synth voice', async () => {
    const player = await createLoaded('synth');

    player.noteOn(60, 0.5);
    expect(toneState.synth.attacks).toEqual([{ note: 'C4', velocity: 0.5, time: undefined }]);

    player.noteOff(60);
    expect(toneState.synth.releases).toEqual([{ note: 'C4', time: undefined }]);
  });

  it('defers noteOff releases while the sustain pedal is down', async () => {
    const player = await createLoaded('synth');

    player.noteOn(60);
    player.setSustain(true);
    player.noteOff(60);
    expect(toneState.synth.releases).toEqual([]);

    player.setSustain(false);
    expect(toneState.synth.releases).toEqual([{ note: 'C4', time: undefined }]);
  });

  it('releases notes immediately while sustain is off', async () => {
    const player = await createLoaded('synth');

    player.noteOn(62);
    player.noteOff(62);
    expect(toneState.synth.releases).toEqual([{ note: 'D4', time: undefined }]);
  });

  it('keeps held notes sounding when the sustain pedal is lifted', async () => {
    const player = await createLoaded('synth');

    player.noteOn(60);
    player.noteOn(64);
    player.setSustain(true);
    player.noteOff(60);
    player.setSustain(false);
    expect(toneState.synth.releases).toEqual([{ note: 'C4', time: undefined }]);

    player.noteOff(64);
    expect(toneState.synth.releases).toHaveLength(2);
  });

  it('releaseAll silences everything, including sustained notes', async () => {
    const player = await createLoaded('synth');

    player.noteOn(60);
    player.setSustain(true);
    player.noteOff(60);
    player.releaseAll();
    expect(toneState.synth.releaseAllCalls).toBe(1);

    player.setSustain(false);
    expect(toneState.synth.releases).toEqual([]);
  });

  it('queues notes until samples are ready, then plays them on the sampler', async () => {
    const player = createInstrument('grand', { baseUrl: '/mmm/' });

    player.noteOn(60);
    await vi.waitFor(() => {
      expect(toneState.samplers).toHaveLength(1);
    });
    expect(toneState.synth.attacks).toEqual([]);

    // The grand sampler points at the self-hosted assets and uses a piano release.
    expect(toneState.samplers[0].urls['60']).toBe('/mmm/sounds/grand/60.mp3');
    expect(toneState.samplers[0].release).toBe(1.2);

    toneState.samplers[0].finishLoad();
    await player.loaded;

    expect(toneState.samplers[0].connectedTo).toBe(toneState.outNodes[0]);
    expect(toneState.samplers[0].attacks).toEqual([{ note: 'C4', velocity: 0.7, time: undefined }]);
    expect(toneState.synth.connectedTo).toBeNull();

    player.noteOn(62);
    expect(toneState.samplers[0].attacks).toEqual([
      { note: 'C4', velocity: 0.7, time: undefined },
      { note: 'D4', velocity: 0.7, time: undefined },
    ]);
    expect(toneState.synth.attacks).toEqual([]);
  });

  it('uses a shorter release for the e-piano sampler', async () => {
    await createLoaded('epiano');
    expect(toneState.samplers[0].release).toBe(0.8);
  });

  it('routes setVolume through the shared output node', async () => {
    const player = createInstrument('synth', { baseUrl: '/mmm/' });
    player.setVolume(-12);
    await player.loaded;
    expect(toneState.volumes[0].value).toBe(-12);

    player.setVolume(-6);
    expect(toneState.volumes[0].value).toBe(-6);
  });

  it('connects to the provided destination when given', async () => {
    const destination = { fakeDestination: true };
    const player = createInstrument('synth', {
      baseUrl: '/mmm/',
      destination: destination as never,
    });
    await player.loaded;
    // Voices share the player's output node, which connects to the destination.
    expect(toneState.synth.connectedTo).toBe(toneState.outNodes[0]);
    expect(toneState.outConnections.at(-1)).toBe(destination);
  });

  it('disposes its voices', async () => {
    const sampled = await createLoaded('grand');
    sampled.dispose();
    await vi.waitFor(() => {
      expect(toneState.samplers[0]?.disposed).toBe(true);
    });

    const synth = await createLoaded('synth');
    synth.dispose();
    await vi.waitFor(() => {
      expect(toneState.synth.disposed).toBe(true);
    });
  });
});
