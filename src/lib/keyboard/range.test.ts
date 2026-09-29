import { describe, expect, it } from 'vitest';
import {
  computeVisibleRange,
  isWhiteKey,
  TOTAL_WHITE_KEY_COUNT,
} from './range';

function countWhiteKeys(lowMidi: number, highMidi: number): number {
  let count = 0;
  for (let midi = lowMidi; midi <= highMidi; midi += 1) {
    if (isWhiteKey(midi)) count += 1;
  }
  return count;
}

describe('computeVisibleRange', () => {
  it('returns the full 21..108 range when every white key fits', () => {
    expect(computeVisibleRange({
      containerWidth: TOTAL_WHITE_KEY_COUNT * 22,
      minWhiteKeyWidth: 22,
      centerMidi: 60,
      octaveShift: 0,
    })).toEqual([21, 108]);
  });

  it('falls back to the full range for an unmeasured container', () => {
    expect(computeVisibleRange({
      containerWidth: 0,
      minWhiteKeyWidth: 44,
      centerMidi: 60,
      octaveShift: 0,
    })).toEqual([21, 108]);
  });

  it('centres middle C for an iPhone landscape viewport', () => {
    const [lowMidi, highMidi] = computeVisibleRange({
      containerWidth: 844,
      minWhiteKeyWidth: 44,
      centerMidi: 60,
      octaveShift: 0,
    });
    expect([lowMidi, highMidi]).toEqual([45, 76]);
    expect(countWhiteKeys(lowMidi, highMidi)).toBe(Math.floor(844 / 44));
    expect(isWhiteKey(lowMidi)).toBe(true);
    expect(isWhiteKey(highMidi)).toBe(true);
  });

  it('shifts by whole octaves', () => {
    const base = computeVisibleRange({
      containerWidth: 844,
      minWhiteKeyWidth: 44,
      centerMidi: 60,
      octaveShift: 0,
    });
    const shifted = computeVisibleRange({
      containerWidth: 844,
      minWhiteKeyWidth: 44,
      centerMidi: 60,
      octaveShift: 1,
    });
    expect(shifted[0] - base[0]).toBe(12);
    expect(shifted[1] - base[1]).toBe(12);
  });

  it('clamps the shifted centre to 21..108', () => {
    const up = computeVisibleRange({
      containerWidth: 844,
      minWhiteKeyWidth: 44,
      centerMidi: 60,
      octaveShift: 9,
    });
    expect(up[1]).toBe(108);

    const down = computeVisibleRange({
      containerWidth: 844,
      minWhiteKeyWidth: 44,
      centerMidi: 60,
      octaveShift: -9,
    });
    expect(down[0]).toBe(21);
  });

  it('always starts and ends on white keys for arbitrary widths and shifts', () => {
    for (let containerWidth = 60; containerWidth <= 1400; containerWidth += 37) {
      for (let octaveShift = -4; octaveShift <= 4; octaveShift += 1) {
        const [lowMidi, highMidi] = computeVisibleRange({
          containerWidth,
          minWhiteKeyWidth: 44,
          centerMidi: 60,
          octaveShift,
        });
        expect(isWhiteKey(lowMidi)).toBe(true);
        expect(isWhiteKey(highMidi)).toBe(true);
        expect(lowMidi).toBeGreaterThanOrEqual(21);
        expect(highMidi).toBeLessThanOrEqual(108);
        expect(lowMidi).toBeLessThanOrEqual(highMidi);
      }
    }
  });

  it('degrades to a single white key for a very narrow container', () => {
    const [lowMidi, highMidi] = computeVisibleRange({
      containerWidth: 10,
      minWhiteKeyWidth: 44,
      centerMidi: 60,
      octaveShift: 0,
    });
    expect(lowMidi).toBe(60);
    expect(highMidi).toBe(60);
  });
});
