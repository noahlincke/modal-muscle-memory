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

  it('drops shared overlap tones by default even if they are valid for the new target', () => {
    expect(filterMicOverlapPitchClasses(
      ['C', 'E', 'G'],
      ['C', 'F', 'A'],
      ['C', 'E'],
    )).toEqual(['G']);
  });

  it('can preserve shared overlap tones when the caller opts in', () => {
    expect(filterMicOverlapPitchClasses(
      ['C', 'E', 'G'],
      ['C', 'F', 'A'],
      ['C', 'E'],
      { preserveAllowedOverlap: true },
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
