import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupAudioUnlock, unlockAudio } from './audioUnlock';

const toneState = vi.hoisted(() => {
  const state = {
    module: null as unknown,
    rawState: 'suspended',
    resumeCalls: 0,
    sourceStarts: 0,
    reset() {
      state.module = null;
      state.rawState = 'suspended';
      state.resumeCalls = 0;
      state.sourceStarts = 0;
    },
  };
  return state;
});

const fakeTone = {
  getContext: () => ({
    rawContext: {
      get state() {
        return toneState.rawState;
      },
      sampleRate: 44100,
      resume: () => {
        toneState.resumeCalls += 1;
        return Promise.resolve();
      },
      createBuffer: () => ({}),
      createBufferSource: () => ({
        buffer: null,
        connect() {},
        start() {
          toneState.sourceStarts += 1;
        },
      }),
    },
  }),
};

vi.mock('./toneLoader', () => ({
  loadTone: () => Promise.resolve(fakeTone),
  getLoadedTone: () => toneState.module,
}));

describe('audioUnlock', () => {
  beforeEach(() => {
    toneState.reset();
  });

  it('resumes the raw context synchronously within the call', () => {
    toneState.module = fakeTone;

    unlockAudio();

    expect(toneState.resumeCalls).toBe(1);
  });

  it('does nothing when the context is already running', () => {
    toneState.module = fakeTone;
    toneState.rawState = 'running';

    unlockAudio();

    expect(toneState.resumeCalls).toBe(0);
  });

  it('records a pending unlock when Tone is not loaded yet and flushes on load', async () => {
    unlockAudio();
    expect(toneState.resumeCalls).toBe(0);

    toneState.module = fakeTone;
    const cleanup = setupAudioUnlock();
    try {
      await Promise.resolve();
      await Promise.resolve();

      expect(toneState.resumeCalls).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('installs capture-phase gesture listeners and removes them once running', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    toneState.module = fakeTone;

    const cleanup = setupAudioUnlock();
    try {
      for (const name of ['pointerdown', 'touchend', 'keydown', 'mousedown']) {
        expect(addSpy).toHaveBeenCalledWith(name, expect.any(Function), true);
      }

      window.dispatchEvent(new Event('pointerdown'));
      expect(toneState.resumeCalls).toBe(1);

      // resume() resolved, so the context reports running: listeners come off.
      toneState.rawState = 'running';
      await Promise.resolve();
      await Promise.resolve();
      for (const name of ['pointerdown', 'touchend', 'keydown', 'mousedown']) {
        expect(removeSpy).toHaveBeenCalledWith(name, expect.any(Function), true);
      }
    } finally {
      cleanup();
    }
  });

  it('plays the silent buffer prime on Apple touch devices', () => {
    toneState.module = fakeTone;
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5 });

    try {
      unlockAudio();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(toneState.sourceStarts).toBe(1);
  });
});
