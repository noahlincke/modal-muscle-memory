export const LOWEST_KEYBOARD_MIDI = 21;
export const HIGHEST_KEYBOARD_MIDI = 108;

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

export function isWhiteKey(midi: number): boolean {
  return !BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
}

const ALL_WHITE_MIDIS: number[] = [];
for (let midi = LOWEST_KEYBOARD_MIDI; midi <= HIGHEST_KEYBOARD_MIDI; midi += 1) {
  if (isWhiteKey(midi)) {
    ALL_WHITE_MIDIS.push(midi);
  }
}

export const TOTAL_WHITE_KEY_COUNT = ALL_WHITE_MIDIS.length;

export interface VisibleRangeParams {
  containerWidth: number;
  minWhiteKeyWidth: number;
  centerMidi: number;
  octaveShift: number;
}

/**
 * How many white keys fit in the container, always bounded to the full
 * 21..108 keyboard, starting and ending on white keys and centred on
 * centerMidi (plus octaveShift in octaves). An unmeasured container
 * (width 0) falls back to the full range.
 */
export function computeVisibleRange(params: VisibleRangeParams): [number, number] {
  const centerMidi = Math.min(
    HIGHEST_KEYBOARD_MIDI,
    Math.max(LOWEST_KEYBOARD_MIDI, params.centerMidi + params.octaveShift * 12),
  );

  let anchorIndex = 0;
  for (let index = 1; index < ALL_WHITE_MIDIS.length; index += 1) {
    if (
      Math.abs(ALL_WHITE_MIDIS[index] - centerMidi)
      < Math.abs(ALL_WHITE_MIDIS[anchorIndex] - centerMidi)
    ) {
      anchorIndex = index;
    }
  }

  const whiteCount = params.containerWidth > 0
    ? Math.min(
        ALL_WHITE_MIDIS.length,
        Math.max(1, Math.floor(params.containerWidth / Math.max(1, params.minWhiteKeyWidth))),
      )
    : ALL_WHITE_MIDIS.length;

  const lowIndex = Math.min(
    ALL_WHITE_MIDIS.length - whiteCount,
    Math.max(0, anchorIndex - Math.floor((whiteCount - 1) / 2)),
  );

  return [ALL_WHITE_MIDIS[lowIndex], ALL_WHITE_MIDIS[lowIndex + whiteCount - 1]];
}
