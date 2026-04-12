import { ALL_KEY_ROOTS } from './keys';
import type {
  ScaleFamilyId,
  ScaleFingeringDefinition,
  ScaleId,
} from '../types/music';
import { getScaleOption, SCALE_LIBRARY } from './scales';

type OneOctavePattern = {
  rh: number[];
  lh: number[];
};

type PatternLibrary = Record<string, OneOctavePattern>;

const MAJOR_ONE_OCTAVE_PATTERNS: PatternLibrary = {
  C: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  G: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  F: { rh: [1, 2, 3, 4, 1, 2, 3, 4], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  D: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Bb: { rh: [4, 1, 2, 3, 1, 2, 3, 4], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
  A: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Eb: { rh: [3, 1, 2, 3, 4, 1, 2, 3], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
  E: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Ab: { rh: [3, 4, 1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 4, 3, 2, 1, 2] },
  B: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [4, 3, 2, 1, 4, 3, 2, 1] },
  Db: { rh: [2, 3, 1, 2, 3, 4, 1, 2], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
  Gb: { rh: [2, 3, 4, 1, 2, 3, 1, 2], lh: [4, 3, 2, 1, 3, 2, 1, 4] },
};

const AEOLIAN_ONE_OCTAVE_PATTERNS: PatternLibrary = {
  C: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  G: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  F: { rh: [1, 2, 3, 4, 1, 2, 3, 4], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  D: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Bb: { rh: [2, 1, 2, 3, 1, 2, 3, 4], lh: [2, 1, 3, 2, 1, 4, 3, 2] },
  A: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Eb: { rh: [3, 1, 2, 3, 4, 1, 2, 3], lh: [2, 1, 4, 3, 2, 1, 3, 2] },
  E: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Ab: { rh: [3, 4, 1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 3, 2, 1, 4, 3] },
  B: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [4, 3, 2, 1, 4, 3, 2, 1] },
  Db: { rh: [3, 4, 1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
  Gb: { rh: [2, 3, 1, 2, 3, 1, 2, 3], lh: [4, 3, 2, 1, 3, 2, 1, 4] },
};

const HARMONIC_MINOR_ONE_OCTAVE_PATTERNS: PatternLibrary = {
  C: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  G: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  F: { rh: [1, 2, 3, 4, 1, 2, 3, 4], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  D: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Bb: { rh: [2, 1, 2, 3, 1, 2, 3, 4], lh: [2, 1, 3, 2, 1, 4, 3, 2] },
  A: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Eb: { rh: [3, 1, 2, 3, 4, 1, 2, 3], lh: [2, 1, 4, 3, 2, 1, 3, 2] },
  E: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Ab: { rh: [2, 3, 1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
  B: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [4, 3, 2, 1, 4, 3, 2, 1] },
  Db: { rh: [3, 4, 1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
  Gb: { rh: [2, 3, 1, 2, 3, 1, 2, 3], lh: [4, 3, 2, 1, 3, 2, 1, 4] },
};

const DORIAN_ONE_OCTAVE_PATTERNS: PatternLibrary = {
  C: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  G: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  F: { rh: [1, 2, 3, 4, 1, 2, 3, 4], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  D: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Bb: { rh: [2, 1, 2, 3, 4, 1, 2, 3], lh: [2, 1, 4, 3, 2, 1, 3, 2] },
  A: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Eb: { rh: [2, 1, 2, 3, 4, 1, 2, 3], lh: [2, 1, 4, 3, 2, 1, 2, 3] },
  E: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Ab: { rh: [2, 3, 1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 3, 2, 1, 3, 2] },
  B: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [4, 3, 2, 1, 4, 3, 2, 1] },
  Db: { rh: [2, 3, 1, 2, 3, 4, 1, 2], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
  Gb: { rh: [2, 3, 1, 2, 3, 4, 1, 2], lh: [4, 3, 2, 1, 3, 2, 1, 4] },
};

const MIXOLYDIAN_ONE_OCTAVE_PATTERNS: PatternLibrary = {
  C: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  G: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  F: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  D: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Bb: { rh: [2, 1, 2, 3, 1, 2, 3, 4], lh: [3, 2, 1, 3, 2, 1, 2, 3] },
  A: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Eb: { rh: [2, 1, 2, 3, 4, 1, 2, 3], lh: [2, 1, 4, 3, 2, 1, 2, 3] },
  E: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  Ab: { rh: [2, 3, 1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 3, 2, 1, 3, 2] },
  B: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [4, 3, 2, 1, 4, 3, 2, 1] },
  Db: { rh: [2, 3, 1, 2, 3, 4, 1, 2], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
  Gb: { rh: [2, 3, 4, 1, 2, 3, 1, 2], lh: [4, 3, 2, 1, 3, 2, 1, 2] },
};

const LYDIAN_ONE_OCTAVE_PATTERNS: PatternLibrary = {
  C: { rh: [2, 3, 1, 2, 3, 1, 2, 3], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  G: { rh: [2, 3, 1, 2, 3, 1, 2, 3], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  F: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  D: { rh: [2, 1, 2, 3, 4, 1, 2, 3], lh: [2, 1, 4, 3, 2, 1, 3, 2] },
  Bb: { rh: [2, 1, 2, 3, 1, 2, 3, 4], lh: [3, 2, 1, 4, 3, 2, 1, 2] },
  A: { rh: [2, 1, 2, 3, 1, 2, 3, 4], lh: [2, 1, 3, 2, 1, 3, 2, 1] },
  Eb: { rh: [2, 1, 2, 1, 2, 3, 1, 2], lh: [3, 2, 1, 3, 2, 1, 2, 3] },
  E: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 2, 3, 1] },
  Ab: { rh: [2, 3, 1, 2, 3, 4, 1, 2], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
  B: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [4, 3, 2, 1, 4, 3, 2, 1] },
  Db: { rh: [2, 3, 1, 2, 3, 4, 1, 2], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
  Gb: { rh: [2, 3, 4, 1, 2, 3, 1, 2], lh: [4, 3, 2, 1, 3, 2, 1, 2] },
};

const MINOR_PENTATONIC_ONE_OCTAVE_PATTERNS: PatternLibrary = {
  C: { rh: [1, 2, 3, 1, 2, 3], lh: [1, 3, 2, 1, 2, 1] },
  G: { rh: [1, 2, 1, 2, 3, 1], lh: [1, 3, 2, 1, 2, 1] },
  F: { rh: [1, 2, 3, 1, 2, 3], lh: [4, 3, 2, 1, 2, 1] },
  D: { rh: [1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 3, 2, 1] },
  Bb: { rh: [2, 3, 4, 1, 2, 3], lh: [4, 3, 2, 1, 4, 3] },
  A: { rh: [1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 3, 2, 1] },
  Eb: { rh: [1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 3, 2, 1] },
  E: { rh: [1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 3, 2, 1] },
  Ab: { rh: [2, 1, 2, 3, 4, 5], lh: [2, 1, 5, 4, 3, 2] },
  B: { rh: [2, 1, 2, 3, 1, 2], lh: [3, 2, 1, 3, 2, 1] },
  Db: { rh: [2, 1, 2, 3, 1, 2], lh: [2, 1, 3, 2, 1, 2] },
  Gb: { rh: [2, 1, 2, 3, 1, 2], lh: [3, 2, 1, 2, 1, 3] },
};

const MAJOR_PENTATONIC_ONE_OCTAVE_PATTERNS: PatternLibrary = {
  C: { rh: [1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 2, 1, 3] },
  G: { rh: [1, 2, 3, 1, 2, 4], lh: [3, 2, 1, 2, 1, 3] },
  F: { rh: [1, 2, 3, 1, 2, 4], lh: [3, 2, 1, 2, 1, 3] },
  D: { rh: [1, 2, 3, 1, 2, 4], lh: [2, 1, 3, 2, 1, 2] },
  Bb: { rh: [3, 1, 2, 1, 2, 3], lh: [3, 2, 1, 2, 1, 3] },
  A: { rh: [1, 2, 3, 1, 2, 1], lh: [2, 1, 2, 1, 3, 2] },
  Eb: { rh: [2, 1, 2, 3, 1, 2], lh: [3, 2, 1, 2, 1, 3] },
  E: { rh: [1, 2, 3, 1, 2, 3], lh: [4, 3, 2, 1, 2, 1] },
  Ab: { rh: [2, 3, 1, 2, 1, 2], lh: [3, 2, 1, 2, 1, 3] },
  B: { rh: [1, 2, 3, 4, 5, 1], lh: [1, 5, 4, 3, 2, 1] },
  Db: { rh: [2, 3, 1, 2, 3, 4], lh: [3, 2, 1, 4, 3, 2] },
  Gb: { rh: [1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 3, 2, 1] },
};

const WHOLE_TONE_ONE_OCTAVE_PATTERNS: PatternLibrary = {
  C: { rh: [1, 2, 1, 2, 3, 4, 5], lh: [3, 2, 1, 4, 3, 2, 1] },
  G: { rh: [1, 2, 1, 2, 3, 4, 5], lh: [3, 2, 1, 4, 3, 2, 1] },
  F: { rh: [1, 2, 3, 1, 2, 3, 4], lh: [4, 3, 2, 1, 3, 2, 1] },
  D: { rh: [2, 1, 2, 3, 4, 1, 2], lh: [2, 1, 4, 3, 2, 1, 2] },
  Bb: { rh: [4, 1, 2, 1, 2, 3, 4], lh: [4, 3, 2, 1, 4, 3, 2] },
  A: { rh: [1, 2, 3, 4, 1, 2, 3], lh: [2, 1, 3, 2, 1, 2, 3] },
  Eb: { rh: [4, 1, 2, 1, 2, 3, 4], lh: [4, 3, 2, 1, 4, 3, 2] },
  E: { rh: [1, 2, 3, 4, 1, 2, 3], lh: [5, 4, 3, 2, 1, 3, 2] },
  Ab: { rh: [2, 3, 1, 2, 1, 2, 3], lh: [3, 2, 1, 2, 1, 3, 2] },
  B: { rh: [1, 2, 3, 1, 2, 3, 4], lh: [4, 3, 2, 1, 3, 2, 1] },
  Db: { rh: [2, 3, 1, 2, 3, 1, 2], lh: [3, 2, 1, 3, 2, 1, 3] },
  Gb: { rh: [2, 3, 4, 1, 2, 3, 4], lh: [4, 3, 2, 1, 3, 1, 2] },
};

const RECOMMENDED_MINOR_BLUES_PATTERNS: PatternLibrary = {
  C: { rh: [1, 3, 1, 3, 1, 3, 1], lh: [1, 3, 1, 4, 3, 2, 1] },
  G: { rh: [1, 3, 1, 3, 1, 3, 1], lh: [4, 2, 1, 3, 2, 1, 4] },
  F: { rh: [1, 2, 3, 1, 2, 3, 1], lh: [1, 4, 3, 2, 1, 3, 1] },
  D: { rh: [1, 3, 1, 3, 1, 3, 1], lh: [3, 1, 4, 3, 2, 1, 3] },
  Bb: { rh: [1, 2, 3, 1, 2, 3, 1], lh: [4, 3, 2, 1, 3, 1, 4] },
  A: { rh: [1, 3, 1, 3, 1, 3, 1], lh: [4, 2, 1, 3, 2, 1, 4] },
  Eb: { rh: [1, 2, 3, 1, 2, 3, 1], lh: [4, 3, 2, 1, 3, 1, 4] },
  E: { rh: [1, 3, 1, 3, 1, 3, 1], lh: [4, 2, 1, 3, 2, 1, 4] },
  Ab: { rh: [1, 2, 3, 1, 2, 3, 1], lh: [2, 1, 3, 1, 4, 3, 2] },
  B: { rh: [1, 2, 3, 1, 2, 3, 1], lh: [4, 2, 1, 3, 2, 1, 4] },
  Db: { rh: [3, 1, 3, 1, 3, 1, 3], lh: [3, 1, 4, 3, 2, 1, 3] },
  Gb: { rh: [3, 1, 3, 1, 3, 1, 3], lh: [4, 2, 1, 3, 2, 1, 4] },
};

const RECOMMENDED_MAJOR_BLUES_PATTERNS: PatternLibrary = {
  C: { rh: [1, 2, 3, 1, 2, 3, 1], lh: [3, 1, 4, 3, 2, 1, 3] },
  G: { rh: [1, 2, 3, 1, 2, 3, 1], lh: [3, 1, 4, 3, 2, 1, 3] },
  F: { rh: [1, 2, 3, 1, 2, 3, 1], lh: [2, 1, 3, 2, 1, 4, 2] },
  D: { rh: [1, 2, 3, 4, 1, 2, 1], lh: [3, 2, 1, 4, 2, 1, 3] },
  Bb: { rh: [3, 1, 3, 1, 3, 1, 3], lh: [2, 1, 3, 2, 1, 4, 2] },
  A: { rh: [1, 2, 3, 4, 1, 2, 1], lh: [2, 1, 3, 2, 1, 4, 2] },
  Eb: { rh: [3, 1, 3, 1, 3, 1, 3], lh: [3, 1, 4, 3, 2, 1, 3] },
  E: { rh: [1, 3, 1, 3, 1, 3, 1], lh: [1, 4, 3, 2, 1, 3, 1] },
  Ab: { rh: [2, 3, 1, 2, 3, 1, 2], lh: [4, 3, 2, 1, 3, 1, 4] },
  B: { rh: [1, 2, 1, 2, 3, 4, 1], lh: [1, 3, 1, 4, 3, 2, 1] },
  Db: { rh: [1, 2, 1, 2, 3, 4, 1], lh: [3, 2, 1, 4, 2, 1, 3] },
  Gb: { rh: [1, 2, 1, 2, 3, 4, 1], lh: [3, 2, 1, 4, 2, 1, 3] },
};

const WHITE_ROOT_OCTATONIC_PATTERN: OneOctavePattern = {
  rh: [1, 2, 3, 1, 2, 3, 1, 2, 3],
  lh: [5, 4, 3, 2, 1, 3, 2, 1, 2],
};

const BLACK_ROOT_OCTATONIC_PATTERN: OneOctavePattern = {
  rh: [2, 3, 1, 2, 3, 1, 2, 3, 4],
  lh: [4, 3, 2, 1, 3, 2, 1, 3, 2],
};

const RECOMMENDED_HALF_WHOLE_DIMINISHED_PATTERNS: PatternLibrary = {
  C: WHITE_ROOT_OCTATONIC_PATTERN,
  G: WHITE_ROOT_OCTATONIC_PATTERN,
  F: WHITE_ROOT_OCTATONIC_PATTERN,
  D: WHITE_ROOT_OCTATONIC_PATTERN,
  Bb: BLACK_ROOT_OCTATONIC_PATTERN,
  A: WHITE_ROOT_OCTATONIC_PATTERN,
  Eb: BLACK_ROOT_OCTATONIC_PATTERN,
  E: WHITE_ROOT_OCTATONIC_PATTERN,
  Ab: BLACK_ROOT_OCTATONIC_PATTERN,
  B: WHITE_ROOT_OCTATONIC_PATTERN,
  Db: BLACK_ROOT_OCTATONIC_PATTERN,
  Gb: BLACK_ROOT_OCTATONIC_PATTERN,
};

const RECOMMENDED_WHOLE_HALF_DIMINISHED_PATTERNS: PatternLibrary = {
  ...RECOMMENDED_HALF_WHOLE_DIMINISHED_PATTERNS,
};

function reverseFingers(fingers: number[]): number[] {
  return [...fingers].reverse();
}

function clonePatterns(patterns: PatternLibrary): PatternLibrary {
  return Object.fromEntries(
    Object.entries(patterns).map(([tonic, pattern]) => [
      tonic,
      {
        rh: [...pattern.rh],
        lh: [...pattern.lh],
      },
    ]),
  );
}

function buildOneOctaveDefinition(
  scaleId: ScaleId,
  tonic: string,
  confidence: ScaleFingeringDefinition['confidence'],
  pattern: OneOctavePattern,
  sourceIds: string[],
): ScaleFingeringDefinition {
  return {
    scaleId,
    tonic,
    confidence,
    octaveSpan: 1,
    sequences: [
      {
        hand: 'rh',
        direction: 'ascending',
        fingers: [...pattern.rh],
      },
      {
        hand: 'rh',
        direction: 'descending',
        fingers: reverseFingers(pattern.rh),
      },
      {
        hand: 'lh',
        direction: 'ascending',
        fingers: [...pattern.lh],
      },
      {
        hand: 'lh',
        direction: 'descending',
        fingers: reverseFingers(pattern.lh),
      },
    ],
    sourceIds,
  };
}

function buildLibraryEntry(
  scaleId: ScaleId,
  confidence: ScaleFingeringDefinition['confidence'],
  patterns: PatternLibrary,
  sourceIds: string[],
) {
  return Object.fromEntries(
    ALL_KEY_ROOTS.map((tonic) => [
      tonic,
      buildOneOctaveDefinition(scaleId, tonic, confidence, patterns[tonic], sourceIds),
    ]),
  );
}

const SCALE_FINGERING_LIBRARY: Partial<Record<ScaleId, Partial<Record<string, ScaleFingeringDefinition>>>> = {
  ionian: buildLibraryEntry(
    'ionian',
    'canonical',
    MAJOR_ONE_OCTAVE_PATTERNS,
    ['berklee_piano_handbook', 'atu_scale_chart', 'pianoscales_major'],
  ),
  aeolian: buildLibraryEntry(
    'aeolian',
    'canonical',
    AEOLIAN_ONE_OCTAVE_PATTERNS,
    ['pianoscales_minor'],
  ),
  harmonic_minor: buildLibraryEntry(
    'harmonic_minor',
    'canonical',
    HARMONIC_MINOR_ONE_OCTAVE_PATTERNS,
    ['atu_scale_chart', 'pianoscales_harmonic_minor'],
  ),
  melodic_minor: buildLibraryEntry(
    'melodic_minor',
    'recommended',
    clonePatterns(MAJOR_ONE_OCTAVE_PATTERNS),
    ['pianoscales_melodic_minor', 'wieland_fingering_principles'],
  ),
  dorian: buildLibraryEntry(
    'dorian',
    'recommended',
    DORIAN_ONE_OCTAVE_PATTERNS,
    ['pianoscales_dorian'],
  ),
  phrygian: buildLibraryEntry(
    'phrygian',
    'recommended',
    clonePatterns(AEOLIAN_ONE_OCTAVE_PATTERNS),
    ['pianoscales_phrygian', 'wieland_fingering_principles'],
  ),
  lydian: buildLibraryEntry(
    'lydian',
    'recommended',
    LYDIAN_ONE_OCTAVE_PATTERNS,
    ['pianoscales_lydian'],
  ),
  mixolydian: buildLibraryEntry(
    'mixolydian',
    'recommended',
    MIXOLYDIAN_ONE_OCTAVE_PATTERNS,
    ['pianoscales_mixolydian'],
  ),
  locrian: buildLibraryEntry(
    'locrian',
    'recommended',
    clonePatterns(AEOLIAN_ONE_OCTAVE_PATTERNS),
    ['pianoscales_locrian', 'wieland_fingering_principles'],
  ),
  major_pentatonic: buildLibraryEntry(
    'major_pentatonic',
    'recommended',
    MAJOR_PENTATONIC_ONE_OCTAVE_PATTERNS,
    ['pianoscales_major_pentatonic'],
  ),
  minor_pentatonic: buildLibraryEntry(
    'minor_pentatonic',
    'recommended',
    MINOR_PENTATONIC_ONE_OCTAVE_PATTERNS,
    ['pianoscales_minor_pentatonic'],
  ),
  major_blues: buildLibraryEntry(
    'major_blues',
    'recommended',
    RECOMMENDED_MAJOR_BLUES_PATTERNS,
    ['pianoscales_blues', 'wieland_fingering_principles'],
  ),
  minor_blues: buildLibraryEntry(
    'minor_blues',
    'recommended',
    RECOMMENDED_MINOR_BLUES_PATTERNS,
    ['pianoscales_blues', 'wieland_fingering_principles'],
  ),
  phrygian_dominant: buildLibraryEntry(
    'phrygian_dominant',
    'recommended',
    clonePatterns(HARMONIC_MINOR_ONE_OCTAVE_PATTERNS),
    ['pianoscales_spanish_gypsy', 'pianoscales_harmonic_minor', 'wieland_fingering_principles'],
  ),
  dorian_b2: buildLibraryEntry(
    'dorian_b2',
    'recommended',
    clonePatterns(DORIAN_ONE_OCTAVE_PATTERNS),
    ['pianoscales_dorian_b2', 'pianoscales_dorian', 'wieland_fingering_principles'],
  ),
  lydian_augmented: buildLibraryEntry(
    'lydian_augmented',
    'recommended',
    clonePatterns(LYDIAN_ONE_OCTAVE_PATTERNS),
    ['pianoscales_lydian_augmented', 'pianoscales_lydian', 'wieland_fingering_principles'],
  ),
  lydian_dominant: buildLibraryEntry(
    'lydian_dominant',
    'recommended',
    clonePatterns(LYDIAN_ONE_OCTAVE_PATTERNS),
    ['pianoscales_lydian_dominant', 'pianoscales_lydian', 'wieland_fingering_principles'],
  ),
  mixolydian_b6: buildLibraryEntry(
    'mixolydian_b6',
    'recommended',
    clonePatterns(MIXOLYDIAN_ONE_OCTAVE_PATTERNS),
    ['pianoscales_aeolian_dominant', 'pianoscales_mixolydian', 'wieland_fingering_principles'],
  ),
  locrian_natural_2: buildLibraryEntry(
    'locrian_natural_2',
    'recommended',
    clonePatterns(AEOLIAN_ONE_OCTAVE_PATTERNS),
    ['pianoscales_half_diminished', 'pianoscales_locrian', 'wieland_fingering_principles'],
  ),
  altered: buildLibraryEntry(
    'altered',
    'recommended',
    clonePatterns(AEOLIAN_ONE_OCTAVE_PATTERNS),
    ['pianoscales_super_locrian', 'pianoscales_locrian', 'wieland_fingering_principles'],
  ),
  whole_tone: buildLibraryEntry(
    'whole_tone',
    'recommended',
    WHOLE_TONE_ONE_OCTAVE_PATTERNS,
    ['pianoscales_whole_tone'],
  ),
  half_whole_diminished: buildLibraryEntry(
    'half_whole_diminished',
    'recommended',
    RECOMMENDED_HALF_WHOLE_DIMINISHED_PATTERNS,
    ['pianoscales_half_whole', 'wieland_fingering_principles'],
  ),
  whole_half_diminished: buildLibraryEntry(
    'whole_half_diminished',
    'recommended',
    RECOMMENDED_WHOLE_HALF_DIMINISHED_PATTERNS,
    ['pianoscales_whole_half', 'wieland_fingering_principles'],
  ),
};

export function getScaleFingering(
  scaleId: ScaleId,
  tonic: string,
  octaveSpan = 1,
): ScaleFingeringDefinition | null {
  const byRoot = SCALE_FINGERING_LIBRARY[scaleId];
  const definition = byRoot?.[tonic];
  if (!definition || definition.octaveSpan !== octaveSpan) {
    return null;
  }

  return definition;
}

export function hasScaleFingering(
  scaleId: ScaleId,
  tonic: string,
  octaveSpan = 1,
): boolean {
  return Boolean(getScaleFingering(scaleId, tonic, octaveSpan));
}

export function availableFingeredScaleIdsForFamilies(
  familyIds: ScaleFamilyId[],
  tonic: string,
  octaveSpan = 1,
): ScaleId[] {
  return Object.values(SCALE_LIBRARY)
    .filter((scale) => familyIds.includes(scale.familyId))
    .map((scale) => scale.id)
    .filter((scaleId): scaleId is ScaleId => hasScaleFingering(scaleId, tonic, octaveSpan));
}

export function availableFingeredTonicsForScaleId(
  scaleId: ScaleId,
  octaveSpan = 1,
): string[] {
  return ALL_KEY_ROOTS.filter((tonic) => hasScaleFingering(scaleId, tonic, octaveSpan));
}

export function fingeredScaleOptionsForFamilies(
  familyIds: ScaleFamilyId[],
  tonic: string,
  octaveSpan = 1,
) {
  return availableFingeredScaleIdsForFamilies(familyIds, tonic, octaveSpan)
    .map((scaleId) => getScaleOption(scaleId));
}
