import type { ParsedMidiMessage } from '../midi/midiParser';
import { midiToPitchClass } from '../theory/noteUtils';

export interface QwertyBinding {
  key: string;
  label: string;
  semitoneOffset: number;
  isBlack: boolean;
}

export const QWERTY_BASE_MIDI = 60;
export const QWERTY_MIN_OCTAVE_SHIFT = -2;
export const QWERTY_MAX_OCTAVE_SHIFT = 1;

export const QWERTY_NOTE_BINDINGS: QwertyBinding[] = [
  { key: 'a', label: 'A', semitoneOffset: 0, isBlack: false },
  { key: 'w', label: 'W', semitoneOffset: 1, isBlack: true },
  { key: 's', label: 'S', semitoneOffset: 2, isBlack: false },
  { key: 'e', label: 'E', semitoneOffset: 3, isBlack: true },
  { key: 'd', label: 'D', semitoneOffset: 4, isBlack: false },
  { key: 'f', label: 'F', semitoneOffset: 5, isBlack: false },
  { key: 't', label: 'T', semitoneOffset: 6, isBlack: true },
  { key: 'g', label: 'G', semitoneOffset: 7, isBlack: false },
  { key: 'y', label: 'Y', semitoneOffset: 8, isBlack: true },
  { key: 'h', label: 'H', semitoneOffset: 9, isBlack: false },
  { key: 'u', label: 'U', semitoneOffset: 10, isBlack: true },
  { key: 'j', label: 'J', semitoneOffset: 11, isBlack: false },
  { key: 'k', label: 'K', semitoneOffset: 12, isBlack: false },
  { key: 'o', label: 'O', semitoneOffset: 13, isBlack: true },
  { key: 'l', label: 'L', semitoneOffset: 14, isBlack: false },
  { key: 'p', label: 'P', semitoneOffset: 15, isBlack: true },
  { key: ';', label: ';', semitoneOffset: 16, isBlack: false },
  { key: '\'', label: '\'', semitoneOffset: 17, isBlack: false },
  { key: ']', label: ']', semitoneOffset: 18, isBlack: true },
  { key: '\\', label: '\\', semitoneOffset: 19, isBlack: false },
];

const NOTE_BINDING_BY_KEY = new Map(QWERTY_NOTE_BINDINGS.map((binding) => [binding.key, binding]));

export type QwertyControlAction = 'octave_down' | 'octave_up';

const CONTROL_ACTION_BY_KEY: Record<string, QwertyControlAction> = {
  z: 'octave_down',
  x: 'octave_up',
};

export function qwertyBindingForKey(key: string): QwertyBinding | null {
  return NOTE_BINDING_BY_KEY.get(key.toLowerCase()) ?? null;
}

export function qwertyControlActionForKey(key: string): QwertyControlAction | null {
  return CONTROL_ACTION_BY_KEY[key.toLowerCase()] ?? null;
}

export function noteNumberForBinding(binding: QwertyBinding, octaveShift: number): number {
  return QWERTY_BASE_MIDI + binding.semitoneOffset + (octaveShift * 12);
}

export function normalizeQwertyOctaveShift(nextShift: number): number {
  return Math.min(QWERTY_MAX_OCTAVE_SHIFT, Math.max(QWERTY_MIN_OCTAVE_SHIFT, nextShift));
}

export function defaultQwertyOctaveShiftForClef(clef: 'treble' | 'bass'): number {
  return clef === 'bass' ? -2 : 0;
}

export function qwertyFriendlyRangeForOctaveShift(octaveShift: number): { min: number; max: number } {
  return {
    min: QWERTY_BASE_MIDI + (octaveShift * 12),
    max: QWERTY_BASE_MIDI + (octaveShift * 12) + QWERTY_NOTE_BINDINGS[QWERTY_NOTE_BINDINGS.length - 1].semitoneOffset,
  };
}

export function octaveShiftForAction(
  currentShift: number,
  action: QwertyControlAction,
): number {
  if (action === 'octave_down') {
    return normalizeQwertyOctaveShift(currentShift - 1);
  }

  if (action === 'octave_up') {
    return normalizeQwertyOctaveShift(currentShift + 1);
  }

  return currentShift;
}

export function qwertyAnchorLabel(octaveShift: number): string {
  const octave = 4 + octaveShift;
  return `A = C${octave}`;
}

export function createSyntheticNoteMessage(
  type: 'note_on' | 'note_off',
  noteNumber: number,
  timestamp: number,
): ParsedMidiMessage {
  if (type === 'note_on') {
    return {
      type: 'note_on',
      noteNumber,
      velocity: 96,
      channel: 1,
      pitchClass: midiToPitchClass(noteNumber),
      timestamp,
    };
  }

  return {
    type: 'note_off',
    noteNumber,
    channel: 1,
    pitchClass: midiToPitchClass(noteNumber),
    timestamp,
  };
}

export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}
