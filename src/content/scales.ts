import type { ScaleId, ScaleOption } from '../types/music';

export const SCALE_LIBRARY: Record<ScaleId, ScaleOption> = {
  ionian: {
    id: 'ionian',
    label: 'Ionian',
    category: 'mode',
    intervalFormula: ['1', '2', '3', '4', '5', '6', '7'],
    qualityTags: ['major', 'stable'],
  },
  dorian: {
    id: 'dorian',
    label: 'Dorian',
    category: 'mode',
    intervalFormula: ['1', '2', 'b3', '4', '5', '6', 'b7'],
    qualityTags: ['minor', 'modal'],
  },
  phrygian: {
    id: 'phrygian',
    label: 'Phrygian',
    category: 'mode',
    intervalFormula: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'],
    qualityTags: ['minor', 'color'],
  },
  lydian: {
    id: 'lydian',
    label: 'Lydian',
    category: 'mode',
    intervalFormula: ['1', '2', '3', '#4', '5', '6', '7'],
    qualityTags: ['major', 'bright'],
  },
  mixolydian: {
    id: 'mixolydian',
    label: 'Mixolydian',
    category: 'mode',
    intervalFormula: ['1', '2', '3', '4', '5', '6', 'b7'],
    qualityTags: ['dominant', 'functional'],
  },
  aeolian: {
    id: 'aeolian',
    label: 'Aeolian',
    category: 'mode',
    intervalFormula: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
    qualityTags: ['minor', 'stable'],
  },
  locrian: {
    id: 'locrian',
    label: 'Locrian',
    category: 'mode',
    intervalFormula: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'],
    qualityTags: ['half_diminished', 'tense'],
  },
  major_pentatonic: {
    id: 'major_pentatonic',
    label: 'Major Pentatonic',
    category: 'pentatonic',
    intervalFormula: ['1', '2', '3', '5', '6'],
    qualityTags: ['major', 'inside'],
  },
  minor_pentatonic: {
    id: 'minor_pentatonic',
    label: 'Minor Pentatonic',
    category: 'pentatonic',
    intervalFormula: ['1', 'b3', '4', '5', 'b7'],
    qualityTags: ['minor', 'inside'],
  },
};

export function getScaleOption(scaleId: ScaleId): ScaleOption {
  return SCALE_LIBRARY[scaleId];
}
