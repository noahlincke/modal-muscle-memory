import { RHYTHM_CELLS } from '../../content/rhythmCells';
import type { RhythmCellId } from '../../types/music';

export function getRhythmCell(id: RhythmCellId) {
  return RHYTHM_CELLS[id];
}

export function getRhythmCellIds(): RhythmCellId[] {
  return Object.keys(RHYTHM_CELLS) as RhythmCellId[];
}
