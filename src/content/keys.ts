import type { KeySetId } from '../types/music';

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
