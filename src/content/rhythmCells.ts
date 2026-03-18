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
  anticipation_4and: {
    id: 'anticipation_4and',
    label: 'Anticipation 4&',
    hits: [
      { offsetBeats: 0, durationBeats: 3.5 },
      { offsetBeats: 3.5, durationBeats: 0.5 },
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
};

export function rhythmCellLabel(id: RhythmCellId): string {
  return RHYTHM_CELLS[id]?.label ?? id;
}
