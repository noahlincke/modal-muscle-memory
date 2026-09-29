import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MicAccessController } from './micAccess';

class FakeMediaStreamTrack {
  stopped = false;

  stop(): void {
    this.stopped = true;
  }
}

class FakeMediaStream {
  tracks: FakeMediaStreamTrack[] = [new FakeMediaStreamTrack()];

  getTracks(): FakeMediaStreamTrack[] {
    return this.tracks;
  }
}

class FakeAudioContext {
  state = 'running';

  sampleRate = 48000;

  resume = vi.fn(async () => {});

  close = vi.fn(async () => {});

  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));

  createAnalyser = vi.fn(() => ({
    fftSize: 1024,
    smoothingTimeConstant: 0,
    getFloatTimeDomainData: vi.fn(),
    disconnect: vi.fn(),
  }));
}

function stubGetUserMedia(getUserMedia: () => Promise<unknown>): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
}

describe('MicAccessController', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  it('stops a late-arriving stream when stop() runs during getUserMedia', async () => {
    let resolveGetUserMedia!: (stream: FakeMediaStream) => void;
    stubGetUserMedia(() => new Promise((resolve) => {
      resolveGetUserMedia = resolve;
    }));

    const controller = new MicAccessController({ onObservation: () => {} });
    const startPromise = controller.start();
    controller.stop();

    const stream = new FakeMediaStream();
    resolveGetUserMedia(stream);
    await startPromise;

    expect(stream.tracks[0].stopped).toBe(true);
    expect(controller.getState().listening).toBe(false);
    expect(controller.getState().ready).toBe(false);
  });

  it('starts and stops cleanly when nothing races', async () => {
    const stream = new FakeMediaStream();
    stubGetUserMedia(() => Promise.resolve(stream));

    const controller = new MicAccessController({ onObservation: () => {} });
    const started = await controller.start();

    expect(started.listening).toBe(true);
    expect(started.ready).toBe(true);

    controller.stop();

    expect(stream.tracks[0].stopped).toBe(true);
    expect(controller.getState().listening).toBe(false);
  });
});
