import { describe, expect, it } from 'vitest';
import { filterMicOverlapPitchClasses } from './micOverlap';

describe('filterMicOverlapPitchClasses', () => {
  it('drops overlap-only carryover tones that are not part of the new target', () => {
    expect(filterMicOverlapPitchClasses(
      ['C', 'E', 'A'],
      ['A', 'D', 'F'],
      ['C', 'E'],
    )).toEqual(['A']);
  });

  it('keeps overlap tones when they are also valid for the new target', () => {
    expect(filterMicOverlapPitchClasses(
      ['C', 'E', 'G'],
      ['C', 'F', 'A'],
      ['C', 'E'],
    )).toEqual(['C', 'G']);
  });

  it('returns an empty set when the input is pure carryover', () => {
    expect(filterMicOverlapPitchClasses(
      ['C', 'E'],
      ['A', 'D', 'F'],
      ['C', 'E'],
    )).toEqual([]);
  });
});
