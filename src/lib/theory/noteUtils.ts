import { Midi, Note } from 'tonal';

const LETTER_SEQUENCE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const NATURAL_SEMITONES: Record<(typeof LETTER_SEQUENCE)[number], number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

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

const MAJOR_DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

function parseSpelling(noteLike: string): { letter: (typeof LETTER_SEQUENCE)[number]; accidental: number } {
  const pitchClass = Note.pitchClass(noteLike) ?? noteLike;
  const match = pitchClass.match(/^([A-G])([b#]*)$/);
  if (!match) {
    throw new Error(`Cannot parse note spelling: ${noteLike}`);
  }

  const [, letterText, accidentalText] = match;
  let accidental = 0;
  for (const symbol of accidentalText) {
    if (symbol === 'b') accidental -= 1;
    if (symbol === '#') accidental += 1;
  }

  return {
    letter: letterText as (typeof LETTER_SEQUENCE)[number],
    accidental,
  };
}

function accidentalText(accidental: number): string {
  if (accidental === 0) {
    return '';
  }

  const symbol = accidental > 0 ? '#' : 'b';
  return symbol.repeat(Math.abs(accidental));
}

function normalizeDeltaToAccidental(delta: number): number {
  let normalized = ((delta % 12) + 12) % 12;
  if (normalized > 6) {
    normalized -= 12;
  }
  return normalized;
}

export function normalizePitchClass(noteLike: string): string {
  const pitchClass = Note.pitchClass(noteLike) ?? noteLike;
  return FLAT_TO_SHARP[pitchClass] ?? pitchClass;
}

export function pitchClassToSemitone(noteLike: string): number {
  const { letter, accidental } = parseSpelling(noteLike);
  return ((NATURAL_SEMITONES[letter] + accidental) % 12 + 12) % 12;
}

export function semitoneToPitchClass(semitone: number): string {
  const normalized = ((semitone % 12) + 12) % 12;
  return SHARP_CHROMATIC[normalized];
}

export function spellScaleDegree(tonic: string, degree: number, accidentalOffset = 0): string {
  const tonicSpelling = parseSpelling(tonic);
  const tonicSemitone = pitchClassToSemitone(tonic);
  const letterIndex = LETTER_SEQUENCE.indexOf(tonicSpelling.letter);
  const targetLetter = LETTER_SEQUENCE[(letterIndex + degree - 1) % LETTER_SEQUENCE.length];
  const desiredSemitone = tonicSemitone + MAJOR_DEGREE_SEMITONES[degree - 1] + accidentalOffset;
  const targetNaturalSemitone = NATURAL_SEMITONES[targetLetter];
  const targetAccidental = normalizeDeltaToAccidental(desiredSemitone - targetNaturalSemitone);
  return `${targetLetter}${accidentalText(targetAccidental)}`;
}

export function spellIntervalAbove(root: string, degree: number, semitoneOffset: number): string {
  const rootSpelling = parseSpelling(root);
  const rootSemitone = pitchClassToSemitone(root);
  const letterIndex = LETTER_SEQUENCE.indexOf(rootSpelling.letter);
  const targetLetter = LETTER_SEQUENCE[(letterIndex + degree - 1) % LETTER_SEQUENCE.length];
  const desiredSemitone = rootSemitone + semitoneOffset;
  const targetNaturalSemitone = NATURAL_SEMITONES[targetLetter];
  const targetAccidental = normalizeDeltaToAccidental(desiredSemitone - targetNaturalSemitone);
  return `${targetLetter}${accidentalText(targetAccidental)}`;
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

export function octaveForSpellingAtMidi(noteSpelling: string, midi: number): number {
  for (let octave = -1; octave <= 9; octave += 1) {
    const candidate = Midi.toMidi(`${noteSpelling}${octave}`);
    if (candidate === midi) {
      return octave;
    }
  }

  return Math.floor(midi / 12) - 1;
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
