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

  it('builds guide-tone and rootless voicings with correctly spelled extensions', () => {
    const guideTone = buildChordToken({
      tonic: 'C',
      lane: 'ionian',
      roman: 'V7',
      voicingFamily: 'guide_tone_37',
      midiRange: { min: 48, max: 72 },
      maxVoiceMotionSemitones: 8,
    });
    const rootless = buildChordToken({
      tonic: 'C',
      lane: 'ionian',
      roman: 'V7',
      voicingFamily: 'rootless_7313',
      midiRange: { min: 48, max: 72 },
      maxVoiceMotionSemitones: 8,
    });

    expect(guideTone.spelledVoicing).toEqual(['B', 'F']);
    expect(guideTone.requiredPitchClasses).toEqual(['B', 'F']);
    expect(rootless.spelledVoicing).toEqual(['F', 'B', 'E']);
    expect(rootless.requiredPitchClasses).toEqual(['F', 'B', 'E']);
  });

  it('keeps guide-tone voicings compact inside a wide register', () => {
    const guideTone = buildChordToken({
      tonic: 'F',
      lane: 'ionian',
      roman: 'iii7',
      voicingFamily: 'guide_tone_37',
      midiRange: { min: 36, max: 84 },
      maxVoiceMotionSemitones: 8,
    });

    expect(guideTone.midiVoicing).toHaveLength(2);
    expect(guideTone.midiVoicing[1] - guideTone.midiVoicing[0]).toBeLessThanOrEqual(10);
  });

  it('keeps first-inversion seventh chords compact across a major turnaround', () => {
    const dmaj7 = buildChordToken({
      tonic: 'D',
      lane: 'ionian',
      roman: 'Imaj7',
      voicingFamily: 'inversion_1',
      midiRange: { min: 48, max: 72 },
      maxVoiceMotionSemitones: 8,
    });
    const bm7 = buildChordToken({
      tonic: 'D',
      lane: 'ionian',
      roman: 'vi7',
      voicingFamily: 'inversion_1',
      midiRange: { min: 48, max: 72 },
      prevVoicing: dmaj7.midiVoicing,
      maxVoiceMotionSemitones: 8,
    });
    const em7 = buildChordToken({
      tonic: 'D',
      lane: 'ionian',
      roman: 'ii7',
      voicingFamily: 'inversion_1',
      midiRange: { min: 48, max: 72 },
      prevVoicing: bm7.midiVoicing,
      maxVoiceMotionSemitones: 8,
    });
    const a7 = buildChordToken({
      tonic: 'D',
      lane: 'ionian',
      roman: 'V7',
      voicingFamily: 'inversion_1',
      midiRange: { min: 48, max: 72 },
      prevVoicing: em7.midiVoicing,
      maxVoiceMotionSemitones: 8,
    });

    [dmaj7, bm7, em7, a7].forEach((token) => {
      expect(token.midiVoicing).toEqual([...token.midiVoicing].sort((a, b) => a - b));
      expect(token.midiVoicing[token.midiVoicing.length - 1] - token.midiVoicing[0]).toBeLessThanOrEqual(14);
    });
  });

  it('keeps closed seventh voicings compact in the same register window', () => {
    const token = buildChordToken({
      tonic: 'D',
      lane: 'ionian',
      roman: 'Imaj7',
      voicingFamily: 'closed_7th',
      midiRange: { min: 48, max: 72 },
      maxVoiceMotionSemitones: 8,
    });

    expect(token.midiVoicing[token.midiVoicing.length - 1] - token.midiVoicing[0]).toBeLessThanOrEqual(14);
  });
});
