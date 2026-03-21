import { describe, expect, it } from 'vitest';
import {
  degreeLabelsForScale,
  degreeLabelsForScaleIds,
  intersectPitchClasses,
  pitchClassesForScale,
  pitchClassesForScaleIds,
} from './scaleMap';

describe('scaleMap', () => {
  it('resolves pitch classes for modal scales from a root', () => {
    expect(pitchClassesForScale('D', 'dorian')).toEqual(['D', 'E', 'F', 'G', 'A', 'B', 'C']);
    expect(pitchClassesForScale('G', 'mixolydian')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('unions and intersects scale pitch classes cleanly', () => {
    const current = pitchClassesForScaleIds('D', ['dorian', 'minor_pentatonic']);
    const next = pitchClassesForScaleIds('G', ['mixolydian']);

    expect(current).toContain('F');
    expect(next).toContain('F');
    expect(intersectPitchClasses(current, next)).toEqual(['D', 'E', 'F', 'G', 'A', 'B', 'C']);
  });

  it('maps pitch classes back to degree labels', () => {
    expect(degreeLabelsForScale('C', 'major_pentatonic')).toEqual({
      C: '1',
      D: '2',
      E: '3',
      G: '5',
      A: '6',
    });

    expect(degreeLabelsForScaleIds('D', ['dorian', 'minor_pentatonic'])).toMatchObject({
      D: '1',
      E: '2',
      F: 'b3',
      G: '4',
      A: '5',
      B: '6',
      C: 'b7',
    });
  });
});
