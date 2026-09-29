import { describe, expect, it } from 'vitest';
import {
  intervalColorForTonicAndRoot,
  intervalLabelForTonicAndRoot,
  rootsInFifthsOrderForTonic,
} from './intervalRing';

describe('interval ring mapping', () => {
  it('maps relative intervals for a tonic/root pair', () => {
    expect(intervalLabelForTonicAndRoot('C', 'E')).toBe('3');
    expect(intervalLabelForTonicAndRoot('C', 'G')).toBe('5');
    expect(intervalLabelForTonicAndRoot('C', 'Bb')).toBe('b7');
  });

  it('returns the expected degree tokens used by the circle and notation highlight', () => {
    expect(intervalColorForTonicAndRoot('C', 'E')).toBe('var(--deg-3)');
    expect(intervalColorForTonicAndRoot('C', 'G')).toBe('var(--deg-5)');
  });

  it('maps colors relative to the phrase tonic for transposed keys', () => {
    expect(intervalLabelForTonicAndRoot('G', 'G')).toBe('1');
    expect(intervalColorForTonicAndRoot('G', 'G')).toBe('var(--deg-1)');
    expect(intervalLabelForTonicAndRoot('G', 'C')).toBe('4');
    expect(intervalColorForTonicAndRoot('G', 'C')).toBe('var(--deg-4)');
  });

  it('rotates circle roots so the current tonic is on top', () => {
    expect(rootsInFifthsOrderForTonic('G').slice(0, 4)).toEqual(['G', 'D', 'A', 'E']);
    expect(rootsInFifthsOrderForTonic('Bb').slice(0, 4)).toEqual(['Bb', 'F', 'C', 'G']);
  });
});
