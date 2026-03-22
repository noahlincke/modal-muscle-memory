import { describe, expect, it } from 'vitest';
import { resolveRomanToChord } from './roman';
import { buildChordToken } from './chordToken';

describe('roman spelling', () => {
  it('spells roman roots relative to flat keys correctly', () => {
    const resolved = resolveRomanToChord('F', 'IV7');

    expect(resolved.rootSpelling).toBe('Bb');
    expect(resolved.symbol).toBe('Bb7');
    expect(resolved.rootPitchClass).toBe('A#');
  });

  it('spells chord voicings with flats in flat keys', () => {
    const token = buildChordToken({
      tonic: 'F',
      lane: 'ionian',
      roman: 'IV7',
      voicingFamily: 'closed_7th',
      midiRange: { min: 48, max: 72 },
      maxVoiceMotionSemitones: 8,
    });

    expect(token.symbol).toBe('Bb7');
    expect(token.spelledVoicing).toEqual(['Bb', 'D', 'F', 'Ab']);
  });
});
