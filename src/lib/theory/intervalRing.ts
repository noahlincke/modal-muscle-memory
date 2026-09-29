import { normalizePitchClass, pitchClassToSemitone } from './noteUtils';

const INTERVAL_LABEL_BY_SEMITONE = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'] as const;
type IntervalLabel = (typeof INTERVAL_LABEL_BY_SEMITONE)[number];

const INTERVAL_COLOR_BY_LABEL: Record<IntervalLabel, string> = {
  '1': 'var(--deg-1)',
  b2: 'var(--deg-b2)',
  '2': 'var(--deg-2)',
  b3: 'var(--deg-b3)',
  '3': 'var(--deg-3)',
  '4': 'var(--deg-4)',
  '#4': 'var(--deg-s4)',
  '5': 'var(--deg-5)',
  b6: 'var(--deg-b6)',
  '6': 'var(--deg-6)',
  b7: 'var(--deg-b7)',
  '7': 'var(--deg-7)',
};

export const CIRCLE_ROOTS_IN_FIFTHS_ORDER = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'] as const;

export const CIRCLE_INTERVAL_LABELS_IN_FIFTHS_ORDER = ['1', '5', '2', '6', '3', '7', '#4', 'b2', 'b6', 'b3', 'b7', '4'] as const;

export const CIRCLE_INTERVAL_COLORS_IN_FIFTHS_ORDER = CIRCLE_INTERVAL_LABELS_IN_FIFTHS_ORDER.map(
  (label) => INTERVAL_COLOR_BY_LABEL[label],
);

export function rootsInFifthsOrderForTonic(tonic: string | null): string[] {
  if (!tonic) {
    return [...CIRCLE_ROOTS_IN_FIFTHS_ORDER];
  }

  const normalizedTonic = normalizePitchClass(tonic);
  const tonicIndex = CIRCLE_ROOTS_IN_FIFTHS_ORDER.findIndex((root) => normalizePitchClass(root) === normalizedTonic);
  if (tonicIndex === -1) {
    return [...CIRCLE_ROOTS_IN_FIFTHS_ORDER];
  }

  return [
    ...CIRCLE_ROOTS_IN_FIFTHS_ORDER.slice(tonicIndex),
    ...CIRCLE_ROOTS_IN_FIFTHS_ORDER.slice(0, tonicIndex),
  ];
}

function relativeSemitone(tonic: string, chordRoot: string): number {
  const tonicSemi = pitchClassToSemitone(normalizePitchClass(tonic));
  const rootSemi = pitchClassToSemitone(normalizePitchClass(chordRoot));
  return (rootSemi - tonicSemi + 12) % 12;
}

export function intervalLabelForTonicAndRoot(
  tonic: string | null,
  chordRoot: string | null,
): IntervalLabel | null {
  if (!tonic || !chordRoot) {
    return null;
  }

  return INTERVAL_LABEL_BY_SEMITONE[relativeSemitone(tonic, chordRoot)];
}

export function intervalColorForTonicAndRoot(
  tonic: string | null,
  chordRoot: string | null,
  fallback = 'var(--signal)',
): string {
  const label = intervalLabelForTonicAndRoot(tonic, chordRoot);
  return label ? INTERVAL_COLOR_BY_LABEL[label] : fallback;
}
