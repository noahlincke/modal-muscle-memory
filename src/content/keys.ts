import type { KeySetId } from '../types/music';

export const ALL_KEY_ROOTS = ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'Gb'] as const;

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
    case 'all_keys':
    default:
      return [...ALL_KEY_ROOTS];
  }
}
