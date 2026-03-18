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

  it('returns the expected color swatches used by the circle and notation highlight', () => {
    expect(intervalColorForTonicAndRoot('C', 'E')).toBe('#d66565');
    expect(intervalColorForTonicAndRoot('C', 'G')).toBe('#8148ca');
  });

  it('maps colors relative to the phrase tonic for transposed keys', () => {
    expect(intervalLabelForTonicAndRoot('G', 'G')).toBe('1');
    expect(intervalColorForTonicAndRoot('G', 'G')).toBe('#4554df');
    expect(intervalLabelForTonicAndRoot('G', 'C')).toBe('4');
    expect(intervalColorForTonicAndRoot('G', 'C')).toBe('#5f95d7');
  });

  it('rotates circle roots so the current tonic is on top', () => {
    expect(rootsInFifthsOrderForTonic('G').slice(0, 4)).toEqual(['G', 'D', 'A', 'E']);
    expect(rootsInFifthsOrderForTonic('Bb').slice(0, 4)).toEqual(['Bb', 'F', 'C', 'G']);
  });
});
