import { detectPitchObservation, type PitchObservation } from './pitchDetection';

export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface MicConnectionState {
  supported: boolean;
  ready: boolean;
  listening: boolean;
  permission: MicPermissionState;
  error: string | null;
}

interface MicAccessControllerOptions {
  onObservation: (observation: PitchObservation) => void;
  onStateChange?: (state: MicConnectionState) => void;
}

const MIC_ANALYSIS_FFT_SIZE = 1024;
const MIC_ANALYSIS_INTERVAL_MS = 8;

function micSupported(): boolean {
  return typeof navigator !== 'undefined'
    && typeof window !== 'undefined'
    && 'mediaDevices' in navigator
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
    && ('AudioContext' in window || 'webkitAudioContext' in window);
}

function createAudioContext(): AudioContext {
  const Context = window.AudioContext ?? (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;

  if (!Context) {
    throw new Error('Microphone input unavailable in this browser.');
  }

  return new Context();
}

export function createMicFallbackState(): MicConnectionState {
  const supported = micSupported();

  return {
    supported,
    ready: false,
    listening: false,
    permission: supported ? 'prompt' : 'unsupported',
    error: supported ? null : 'Microphone input unavailable in this browser.',
  };
}

export async function microphonePermissionGranted(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      return false;
    }

    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

export class MicAccessController {
  private stream: MediaStream | null = null;

  private audioContext: AudioContext | null = null;

  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private analyserNode: AnalyserNode | null = null;

  private frameBuffer: Float32Array<ArrayBuffer> | null = null;

  private analysisTimerId: number | null = null;

  private generation = 0;

  private state: MicConnectionState = createMicFallbackState();

  private readonly onObservation: MicAccessControllerOptions['onObservation'];

  private readonly onStateChange?: MicAccessControllerOptions['onStateChange'];

  constructor(options: MicAccessControllerOptions) {
    this.onObservation = options.onObservation;
    this.onStateChange = options.onStateChange;
  }

  async start(): Promise<MicConnectionState> {
    if (!this.state.supported) {
      this.emitState();
      return this.state;
    }

    if (this.state.listening && this.state.ready) {
      return this.state;
    }

    const generation = ++this.generation;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      if (generation !== this.generation) {
        this.stop();
        return this.state;
      }

      this.audioContext = createAudioContext();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      if (generation !== this.generation) {
        this.stop();
        return this.state;
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = MIC_ANALYSIS_FFT_SIZE;
      this.analyserNode.smoothingTimeConstant = 0.04;
      this.sourceNode.connect(this.analyserNode);
      this.frameBuffer = new Float32Array(this.analyserNode.fftSize) as Float32Array<ArrayBuffer>;

      this.state = {
        supported: true,
        ready: true,
        listening: true,
        permission: 'granted',
        error: null,
      };
      this.emitState();
      this.scheduleAnalysis();
      return this.state;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to access the microphone.';
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      this.state = {
        supported: this.state.supported,
        ready: false,
        listening: false,
        permission: denied ? 'denied' : 'prompt',
        error: denied ? 'Microphone permission is blocked.' : message,
      };
      this.emitState();
      return this.state;
    }
  }

  stop(): void {
    this.generation += 1;
    const wasActive = this.state.ready || this.state.listening || this.stream !== null || this.audioContext !== null;

    if (this.analysisTimerId !== null) {
      window.clearInterval(this.analysisTimerId);
      this.analysisTimerId = null;
    }

    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.analyserNode?.disconnect();
    this.analyserNode = null;
    this.frameBuffer = null;

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    this.state = {
      ...this.state,
      ready: false,
      listening: false,
    };
    if (wasActive) {
      this.emitState();
    }
  }

  getState(): MicConnectionState {
    return this.state;
  }

  private scheduleAnalysis(): void {
    if (this.analysisTimerId !== null) {
      window.clearInterval(this.analysisTimerId);
    }

    this.analysisTimerId = window.setInterval(() => {
      if (!this.state.listening) {
        return;
      }

      this.analyzeFrame();
    }, MIC_ANALYSIS_INTERVAL_MS);
  }

  private analyzeFrame(): void {
    if (!this.analyserNode || !this.frameBuffer || !this.audioContext) {
      return;
    }

    this.analyserNode.getFloatTimeDomainData(this.frameBuffer);
    this.onObservation(detectPitchObservation(
      this.frameBuffer,
      this.audioContext.sampleRate,
      performance.now(),
    ));
  }

  private emitState(): void {
    this.onStateChange?.(this.state);
  }
}
