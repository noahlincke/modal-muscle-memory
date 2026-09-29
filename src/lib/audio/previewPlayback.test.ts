import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Phrase } from '../../types/music';
import type { InstrumentPlayer } from './instruments';
import { parseMidiMessage } from '../midi/midiParser';
import { PreviewPlayback } from './previewPlayback';

const toneState = vi.hoisted(() => {
  const state = {
    volumes: [] as Array<{ volume: { value: number } }>,
    clickSynths: [] as Array<{
      attacks: Array<{ pitch: string; duration: string; time?: number; velocity?: number }>;
      releaseAllCalls: number;
    }>,
    transportStarts: 0,
    scheduled: [] as Array<{ time: number; fn: (time: number) => void }>,
    startCalls: 0,
    reset() {
      state.volumes = [];
      state.clickSynths = [];
      state.transportStarts = 0;
      state.scheduled = [];
      state.startCalls = 0;
    },
  };
  return state;
});

vi.mock('./toneLoader', () => ({
  loadTone: async () => fakeTone,
}));

const fakeTone = {
  now: () => 0,
  start: async () => {
    toneState.startCalls += 1;
  },
  Volume: class {
    volume: { value: number };

    constructor(db?: number) {
      this.volume = { value: db ?? 0 };
      toneState.volumes.push(this);
    }

    toDestination() {
      return this;
    }

    connect() {
      return this;
    }
  },
  MembraneSynth: class {
    attacks: Array<{ pitch: string; duration: string; time?: number; velocity?: number }> = [];

    releaseAllCalls = 0;

    constructor() {
      toneState.clickSynths.push(this);
    }

    connect() {
      return this;
    }

    triggerAttackRelease(pitch: string, duration: string, time?: number, velocity?: number) {
      this.attacks.push({ pitch, duration, time, velocity });
    }

    releaseAll() {
      this.releaseAllCalls += 1;
    }

    triggerRelease() {
      this.releaseAllCalls += 1;
    }
  },
  Transport: {
    bpm: { value: 0 },
    stop() {},
    cancel() {},
    clear() {},
    start() {
      toneState.transportStarts += 1;
    },
    // Fires immediately so playPhrase/playScalePrompt resolve in tests.
    schedule(fn: (time: number) => void, time: number) {
      toneState.scheduled.push({ time, fn });
      fn(0);
      return toneState.scheduled.length;
    },
  },
};

function makePlayerMock(): InstrumentPlayer & {
  noteOnCalls: Array<{ midi: number; velocity?: number; time?: number }>;
  noteOffCalls: Array<{ midi: number; time?: number }>;
  setSustainCalls: boolean[];
  releaseAllCalls: number;
} {
  const player = {
    id: 'upright' as const,
    loaded: Promise.resolve(),
    noteOnCalls: [] as Array<{ midi: number; velocity?: number; time?: number }>,
    noteOffCalls: [] as Array<{ midi: number; time?: number }>,
    setSustainCalls: [] as boolean[],
    releaseAllCalls: 0,
    noteOn(midi: number, velocity?: number, time?: number) {
      player.noteOnCalls.push({ midi, velocity, time });
    },
    noteOff(midi: number, time?: number) {
      player.noteOffCalls.push({ midi, time });
    },
    setSustain(on: boolean) {
      player.setSustainCalls.push(on);
    },
    releaseAll() {
      player.releaseAllCalls += 1;
    },
    setVolume() {},
    dispose() {},
  };
  return player;
}

const phrase = {
  tempo: 120,
  events: [
    { id: 'e1', chordTokenId: 't1', progressionStepIndex: 0, bar: 1, beat: 1, durationBeats: 4, rhythmCellId: 'block_whole' },
  ],
  tokensById: { t1: { midiVoicing: [60, 64, 67, 71] } },
} as unknown as Phrase;

describe('PreviewPlayback', () => {
  beforeEach(() => {
    toneState.reset();
  });

  it('creates one click voice when prepare is entered concurrently', async () => {
    const preview = new PreviewPlayback();
    const player = makePlayerMock();
    preview.setInstrumentPlayer(player);

    await Promise.all([
      preview.playPhrase(phrase),
      preview.playPhrase(phrase),
    ]);

    expect(toneState.clickSynths).toHaveLength(1);
    expect(toneState.volumes).toHaveLength(1);
    // Context unlock moved to audioUnlock; prepare no longer calls Tone.start().
    expect(toneState.startCalls).toBe(0);
    // The phrase voicing reached the shared player on each run.
    const phraseNoteOns = player.noteOnCalls.filter((call) => call.velocity === 0.45);
    expect(phraseNoteOns).toHaveLength(8);
    expect(phraseNoteOns.slice(0, 4).map((call) => call.midi)).toEqual([60, 64, 67, 71]);
  });

  it('routes MIDI CC64 sustain to the shared player', () => {
    const message = parseMidiMessage(new Uint8Array([0xb0, 64, 127]), 0);
    if (message.type !== 'sustain') {
      throw new Error(`expected a sustain message, got ${message.type}`);
    }

    const preview = new PreviewPlayback();
    const player = makePlayerMock();
    preview.setInstrumentPlayer(player);
    preview.setSustain(message.isDown);

    expect(player.setSustainCalls).toEqual([true]);
  });
});
