import { midiToPitchClass } from '../theory/noteUtils';

export type ParsedMidiMessage =
  | {
      type: 'note_on';
      noteNumber: number;
      velocity: number;
      channel: number;
      pitchClass: string;
      timestamp: number;
    }
  | {
      type: 'note_off';
      noteNumber: number;
      channel: number;
      pitchClass: string;
      timestamp: number;
    }
  | {
      type: 'sustain';
      isDown: boolean;
      value: number;
      channel: number;
      timestamp: number;
    }
  | {
      type: 'unsupported';
      status: number;
      timestamp: number;
    };

export function parseMidiMessage(
  data: Uint8Array,
  timestamp: number,
): ParsedMidiMessage {
  const [status = 0, data1 = 0, data2 = 0] = data;
  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1;

  if (command === 0x90 && data2 > 0) {
    return {
      type: 'note_on',
      noteNumber: data1,
      velocity: data2,
      channel,
      pitchClass: midiToPitchClass(data1),
      timestamp,
    };
  }

  if (command === 0x80 || (command === 0x90 && data2 === 0)) {
    return {
      type: 'note_off',
      noteNumber: data1,
      channel,
      pitchClass: midiToPitchClass(data1),
      timestamp,
    };
  }

  if (command === 0xb0 && data1 === 64) {
    return {
      type: 'sustain',
      isDown: data2 >= 64,
      value: data2,
      channel,
      timestamp,
    };
  }

  return {
    type: 'unsupported',
    status,
    timestamp,
  };
}
