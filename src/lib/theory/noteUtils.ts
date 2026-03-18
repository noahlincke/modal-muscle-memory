import { Midi, Note } from 'tonal';

const SHARP_CHROMATIC = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
  Cb: 'B',
  Fb: 'E',
};

export function normalizePitchClass(noteLike: string): string {
  const pitchClass = Note.pitchClass(noteLike) ?? noteLike;
  return FLAT_TO_SHARP[pitchClass] ?? pitchClass;
}

export function pitchClassToSemitone(noteLike: string): number {
  const normalized = normalizePitchClass(noteLike);
  const index = SHARP_CHROMATIC.indexOf(normalized as (typeof SHARP_CHROMATIC)[number]);
  if (index === -1) {
    throw new Error(`Unknown pitch class: ${noteLike}`);
  }
  return index;
}

export function semitoneToPitchClass(semitone: number): string {
  const normalized = ((semitone % 12) + 12) % 12;
  return SHARP_CHROMATIC[normalized];
}

export function midiToPitchClass(midi: number): string {
  return semitoneToPitchClass(midi % 12);
}

export function midiToNoteName(midi: number): string {
  return Midi.midiToNoteName(midi, { sharps: true }) ?? 'C4';
}

export function noteNameToMidi(note: string): number {
  const midi = Midi.toMidi(note);
  if (midi === null) {
    throw new Error(`Cannot parse note: ${note}`);
  }
  return midi;
}

export function midiCandidatesForPitchClass(
  pitchClass: string,
  min: number,
  max: number,
): number[] {
  const target = pitchClassToSemitone(pitchClass);
  const values: number[] = [];
  for (let midi = min; midi <= max; midi += 1) {
    if (((midi % 12) + 12) % 12 === target) {
      values.push(midi);
    }
  }
  return values;
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}
