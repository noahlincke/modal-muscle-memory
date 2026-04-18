import { pitchClassToSemitone } from '../lib/theory/noteUtils';
import type { KeySetId, ModeLane, ScaleId } from '../types/music';

export const ALL_KEY_ROOTS = ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'Gb'] as const;
export const CIRCLE_OF_FIFTHS_CLOCKWISE = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'] as const;

const KEY_COMPLEXITY: Record<string, number> = {
  C: 0,
  G: 1,
  F: 1,
  D: 2,
  Bb: 2,
  A: 3,
  Eb: 3,
  E: 4,
  Ab: 4,
  B: 5,
  Db: 5,
  Gb: 6,
};

const KEY_SIGNATURE_ACCIDENTAL: Record<string, { symbol: 'flat' | 'sharp'; count: number }> = {
  C: { symbol: 'sharp', count: 0 },
  G: { symbol: 'sharp', count: 1 },
  D: { symbol: 'sharp', count: 2 },
  A: { symbol: 'sharp', count: 3 },
  E: { symbol: 'sharp', count: 4 },
  B: { symbol: 'sharp', count: 5 },
  'F#': { symbol: 'sharp', count: 6 },
  'C#': { symbol: 'sharp', count: 7 },
  F: { symbol: 'flat', count: 1 },
  Bb: { symbol: 'flat', count: 2 },
  Eb: { symbol: 'flat', count: 3 },
  Ab: { symbol: 'flat', count: 4 },
  Db: { symbol: 'flat', count: 5 },
  Gb: { symbol: 'flat', count: 6 },
  Cb: { symbol: 'flat', count: 7 },
};

const KEY_SET_ACCIDENTAL_LIMIT: Partial<Record<KeySetId, number>> = {
  c_only: 0,
  max_1_accidental: 1,
  max_2_accidentals: 2,
  max_3_accidentals: 3,
  max_4_accidentals: 4,
  max_5_accidentals: 5,
};

const SEMITONE_TO_SIGNATURE_ROOT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

const LANE_SIGNATURE_ROOT_OFFSETS: Record<ModeLane, number[]> = {
  ionian: [0],
  aeolian: [3],
  ionian_aeolian_mixture: [0, 3],
  dorian: [10],
  mixolydian: [5],
  lydian: [7],
  phrygian: [8],
};

const SCALE_SIGNATURE_ROOT_OFFSETS: Record<ScaleId, number[]> = {
  ionian: [0],
  dorian: [10],
  phrygian: [8],
  lydian: [7],
  mixolydian: [5],
  aeolian: [3],
  locrian: [1],
  major_pentatonic: [0],
  minor_pentatonic: [3],
  major_blues: [0],
  minor_blues: [3],
  harmonic_minor: [3],
  phrygian_dominant: [8],
  melodic_minor: [3],
  dorian_b2: [1],
  lydian_augmented: [11],
  lydian_dominant: [10],
  mixolydian_b6: [8],
  locrian_natural_2: [7],
  altered: [5],
  whole_tone: [5],
  half_whole_diminished: [5],
  whole_half_diminished: [3],
};

function accidentalLimitForKeySet(keySet: KeySetId): number | null {
  if (keySet === 'all_keys') {
    return null;
  }

  return KEY_SET_ACCIDENTAL_LIMIT[keySet] ?? null;
}

function signatureRootForOffset(tonic: string, semitoneOffset: number): string {
  const semitone = (pitchClassToSemitone(tonic) + semitoneOffset + 12) % 12;
  return SEMITONE_TO_SIGNATURE_ROOT[semitone];
}

function keyComplexityForSignatureRoot(signatureRoot: string): number {
  return KEY_COMPLEXITY[signatureRoot] ?? 6;
}

function rootsForComplexityLimit(limit: number, complexityForRoot: (root: string) => number): string[] {
  return ALL_KEY_ROOTS.filter((root) => complexityForRoot(root) <= limit);
}

export function keyComplexityForLane(root: string, lane: ModeLane): number {
  const signatureOffsets = LANE_SIGNATURE_ROOT_OFFSETS[lane] ?? [0];

  return Math.min(...signatureOffsets.map((offset) => (
    keyComplexityForSignatureRoot(signatureRootForOffset(root, offset))
  )));
}

export function keyComplexityForScale(root: string, scaleId: ScaleId): number {
  const signatureOffsets = SCALE_SIGNATURE_ROOT_OFFSETS[scaleId] ?? [0];

  return Math.min(...signatureOffsets.map((offset) => (
    keyComplexityForSignatureRoot(signatureRootForOffset(root, offset))
  )));
}

export function rootsForKeySet(keySet: KeySetId): string[] {
  switch (keySet) {
    case 'c_only':
      return ['C'];
    case 'max_1_accidental':
      return ALL_KEY_ROOTS.filter((root) => (KEY_COMPLEXITY[root] ?? 6) <= 1);
    case 'max_2_accidentals':
      return ALL_KEY_ROOTS.filter((root) => (KEY_COMPLEXITY[root] ?? 6) <= 2);
    case 'max_3_accidentals':
      return ALL_KEY_ROOTS.filter((root) => (KEY_COMPLEXITY[root] ?? 6) <= 3);
    case 'max_4_accidentals':
      return ALL_KEY_ROOTS.filter((root) => (KEY_COMPLEXITY[root] ?? 6) <= 4);
    case 'max_5_accidentals':
      return ALL_KEY_ROOTS.filter((root) => (KEY_COMPLEXITY[root] ?? 6) <= 5);
    case 'custom':
      return [];
    case 'all_keys':
    default:
      return [...ALL_KEY_ROOTS];
  }
}

export function rootsForKeySetInLane(keySet: KeySetId, lane: ModeLane): string[] {
  const limit = accidentalLimitForKeySet(keySet);
  if (limit === null) {
    return rootsForKeySet(keySet);
  }

  return rootsForComplexityLimit(limit, (root) => keyComplexityForLane(root, lane));
}

export function rootsForKeySetForScale(keySet: KeySetId, scaleId: ScaleId): string[] {
  const limit = accidentalLimitForKeySet(keySet);
  if (limit === null) {
    return rootsForKeySet(keySet);
  }

  return rootsForComplexityLimit(limit, (root) => keyComplexityForScale(root, scaleId));
}

export function normalizeIncludedKeyRoots(roots: string[] | undefined, fallback: string[] = []): string[] {
  if (!Array.isArray(roots)) {
    return [...fallback];
  }

  const validRoots = new Set(ALL_KEY_ROOTS);
  const normalized = ALL_KEY_ROOTS.filter((root) => roots.includes(root) && validRoots.has(root));
  return normalized.length > 0 || roots.length === 0 ? normalized : [...fallback];
}

export function resolveIncludedKeyRoots(keySet: KeySetId, includedKeyRoots: string[] | undefined): string[] {
  if (keySet === 'custom') {
    return normalizeIncludedKeyRoots(includedKeyRoots, []);
  }

  return rootsForKeySet(keySet);
}

export function resolveIncludedKeyRootsForLane(
  keySet: KeySetId,
  includedKeyRoots: string[] | undefined,
  lane: ModeLane,
): string[] {
  if (keySet === 'custom') {
    return normalizeIncludedKeyRoots(includedKeyRoots, []);
  }

  return rootsForKeySetInLane(keySet, lane);
}

export function resolveIncludedKeyRootsForScale(
  keySet: KeySetId,
  includedKeyRoots: string[] | undefined,
  scaleId: ScaleId,
): string[] {
  if (keySet === 'custom') {
    return normalizeIncludedKeyRoots(includedKeyRoots, []);
  }

  return rootsForKeySetForScale(keySet, scaleId);
}

export function keySignatureForRoot(root: string): { symbol: 'flat' | 'sharp'; count: number } | null {
  return KEY_SIGNATURE_ACCIDENTAL[root] ?? null;
}

export function circleDistance(rootA: string, rootB: string): number {
  const indexA = CIRCLE_OF_FIFTHS_CLOCKWISE.indexOf(rootA as typeof CIRCLE_OF_FIFTHS_CLOCKWISE[number]);
  const indexB = CIRCLE_OF_FIFTHS_CLOCKWISE.indexOf(rootB as typeof CIRCLE_OF_FIFTHS_CLOCKWISE[number]);

  if (indexA < 0 || indexB < 0) {
    return Number.POSITIVE_INFINITY;
  }

  const forward = Math.abs(indexA - indexB);
  return Math.min(forward, CIRCLE_OF_FIFTHS_CLOCKWISE.length - forward);
}

export function nextRootOnCircle(
  currentRoot: string,
  allowedRoots: string[],
  direction: 'clockwise' | 'counterclockwise',
): string | null {
  const allowed = new Set(allowedRoots);
  const ordered = CIRCLE_OF_FIFTHS_CLOCKWISE.filter((root) => allowed.has(root));
  if (ordered.length === 0) {
    return null;
  }

  if (ordered.length === 1) {
    return ordered[0];
  }

  const currentIndex = CIRCLE_OF_FIFTHS_CLOCKWISE.indexOf(currentRoot as typeof CIRCLE_OF_FIFTHS_CLOCKWISE[number]);
  if (currentIndex < 0) {
    return ordered[0];
  }

  const step = direction === 'clockwise' ? 1 : -1;
  const total = CIRCLE_OF_FIFTHS_CLOCKWISE.length;

  for (let offset = 1; offset < total; offset += 1) {
    const nextIndex = (currentIndex + (step * offset) + total) % total;
    const candidate = CIRCLE_OF_FIFTHS_CLOCKWISE[nextIndex];
    if (allowed.has(candidate)) {
      return candidate;
    }
  }

  return currentRoot;
}
