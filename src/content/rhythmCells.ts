import type { RhythmCellId } from '../types/music';

export interface RhythmHit {
  offsetBeats: number;
  durationBeats: number;
}

export interface RhythmCell {
  id: RhythmCellId;
  label: string;
  hits: RhythmHit[];
}

export const RHYTHM_CELLS: Record<RhythmCellId, RhythmCell> = {
  block_whole: {
    id: 'block_whole',
    label: 'Block Whole',
    hits: [{ offsetBeats: 0, durationBeats: 4 }],
  },
  halves: {
    id: 'halves',
    label: 'Halves',
    hits: [
      { offsetBeats: 0, durationBeats: 2 },
      { offsetBeats: 2, durationBeats: 2 },
    ],
  },
  quarters: {
    id: 'quarters',
    label: 'Quarters',
    hits: [
      { offsetBeats: 0, durationBeats: 1 },
      { offsetBeats: 1, durationBeats: 1 },
      { offsetBeats: 2, durationBeats: 1 },
      { offsetBeats: 3, durationBeats: 1 },
    ],
  },
  charleston: {
    id: 'charleston',
    label: 'Charleston',
    hits: [
      { offsetBeats: 0, durationBeats: 1.5 },
      { offsetBeats: 1.5, durationBeats: 2.5 },
    ],
  },
  tresillo_332: {
    id: 'tresillo_332',
    label: 'Tresillo 3-3-2',
    hits: [
      { offsetBeats: 0, durationBeats: 1.5 },
      { offsetBeats: 1.5, durationBeats: 1.5 },
      { offsetBeats: 3, durationBeats: 1 },
    ],
  },
  backbeat_2_4: {
    id: 'backbeat_2_4',
    label: 'Backbeat 2 + 4',
    hits: [
      { offsetBeats: 1, durationBeats: 1 },
      { offsetBeats: 3, durationBeats: 1 },
    ],
  },
  push_2and_hold: {
    id: 'push_2and_hold',
    label: 'Push 2& Hold',
    hits: [
      { offsetBeats: 1.5, durationBeats: 2.5 },
    ],
  },
  anticipation_4and: {
    id: 'anticipation_4and',
    label: 'Anticipation 4&',
    hits: [
      { offsetBeats: 0, durationBeats: 3.5 },
      { offsetBeats: 3.5, durationBeats: 0.5 },
    ],
  },
  push_4and_hold: {
    id: 'push_4and_hold',
    label: 'Push 4& Across',
    hits: [
      { offsetBeats: 3.5, durationBeats: 1.5 },
    ],
  },
  hold_from_3: {
    id: 'hold_from_3',
    label: 'Hold From 3',
    hits: [
      { offsetBeats: 2, durationBeats: 3 },
    ],
  },
  offbeat_1and_3: {
    id: 'offbeat_1and_3',
    label: 'Offbeat 1& + 3',
    hits: [
      { offsetBeats: 0.5, durationBeats: 1.5 },
      { offsetBeats: 2, durationBeats: 2 },
    ],
  },
  syncopated_2and_4: {
    id: 'syncopated_2and_4',
    label: 'Syncopated 2& + 4',
    hits: [
      { offsetBeats: 1.5, durationBeats: 1.5 },
      { offsetBeats: 3, durationBeats: 1 },
    ],
  },
  late_pickup_4: {
    id: 'late_pickup_4',
    label: 'Pickup 4',
    hits: [
      { offsetBeats: 3, durationBeats: 1 },
    ],
  },
  floating_2and: {
    id: 'floating_2and',
    label: 'Floating 2&',
    hits: [
      { offsetBeats: 0.5, durationBeats: 1 },
      { offsetBeats: 2.5, durationBeats: 1.5 },
    ],
  },
};

export function rhythmCellLabel(id: RhythmCellId): string {
  return RHYTHM_CELLS[id]?.label ?? id;
}
