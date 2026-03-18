import { parseMidiMessage, type ParsedMidiMessage } from './midiParser';

export interface MidiInputSummary {
  id: string;
  name: string;
  manufacturer: string;
  state: MIDIPortDeviceState;
}

export interface MidiConnectionState {
  supported: boolean;
  ready: boolean;
  inputs: MidiInputSummary[];
  activeInputId: string | null;
  error: string | null;
}

interface MidiAccessControllerOptions {
  onMessage: (message: ParsedMidiMessage) => void;
  onStateChange?: (state: MidiConnectionState) => void;
}

function summarizeInputs(access: MIDIAccess): MidiInputSummary[] {
  return Array.from(access.inputs.values()).map((input) => ({
    id: input.id,
    name: input.name ?? 'Unknown input',
    manufacturer: input.manufacturer ?? 'Unknown manufacturer',
    state: input.state,
  }));
}

export class MidiAccessController {
  private access: MIDIAccess | null = null;

  private activeInput: MIDIInput | null = null;

  private state: MidiConnectionState = {
    supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
    ready: false,
    inputs: [],
    activeInputId: null,
    error: null,
  };

  private readonly onMessage: MidiAccessControllerOptions['onMessage'];

  private readonly onStateChange?: MidiAccessControllerOptions['onStateChange'];

  constructor(options: MidiAccessControllerOptions) {
    this.onMessage = options.onMessage;
    this.onStateChange = options.onStateChange;
  }

  async initialize(preferredInputId: string | null = null): Promise<MidiConnectionState> {
    if (!this.state.supported) {
      this.state = {
        ...this.state,
        ready: false,
        error: 'Web MIDI API unavailable in this browser.',
      };
      this.emitState();
      return this.state;
    }

    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => {
        this.refreshInputs(preferredInputId);
      };

      this.refreshInputs(preferredInputId);

      return this.state;
    } catch (error) {
      this.state = {
        ...this.state,
        ready: false,
        error: error instanceof Error ? error.message : 'Failed to initialize MIDI.',
      };
      this.emitState();
      return this.state;
    }
  }

  disconnect(): void {
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
      this.activeInput = null;
    }

    if (this.access) {
      this.access.onstatechange = null;
    }
  }

  getState(): MidiConnectionState {
    return this.state;
  }

  private refreshInputs(preferredInputId: string | null): void {
    if (!this.access) {
      return;
    }

    const inputs = summarizeInputs(this.access);

    const nextInput = this.selectInput(inputs, preferredInputId);

    if (this.activeInput && this.activeInput.id !== nextInput?.id) {
      this.activeInput.onmidimessage = null;
      this.activeInput = null;
    }

    if (nextInput) {
      const midiInput = this.access.inputs.get(nextInput.id) ?? null;
      if (midiInput) {
        midiInput.onmidimessage = (event: MIDIMessageEvent) => {
          const data = event.data ?? new Uint8Array();
          this.onMessage(parseMidiMessage(data, event.timeStamp));
        };
        this.activeInput = midiInput;
      }
    }

    this.state = {
      ...this.state,
      ready: inputs.length > 0,
      inputs,
      activeInputId: nextInput?.id ?? null,
      error: null,
    };

    this.emitState();
  }

  private selectInput(
    inputs: MidiInputSummary[],
    preferredInputId: string | null,
  ): MidiInputSummary | null {
    if (inputs.length === 0) {
      return null;
    }

    if (preferredInputId) {
      const preferred = inputs.find((input) => input.id === preferredInputId);
      if (preferred) {
        return preferred;
      }
    }

    if (this.activeInput) {
      const current = inputs.find((input) => input.id === this.activeInput?.id);
      if (current) {
        return current;
      }
    }

    return inputs[0];
  }

  private emitState(): void {
    this.onStateChange?.(this.state);
  }
}
