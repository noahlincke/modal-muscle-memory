import { describe, expect, it } from 'vitest';
import { buildChordToken } from '../theory/chordToken';
import { evaluateAttempt, evaluateFlashcardAttempt } from './evaluator';

const token = buildChordToken({
  tonic: 'C',
  lane: 'ionian',
  roman: 'Imaj7',
  voicingFamily: 'inversion_1',
  midiRange: { min: 48, max: 72 },
  maxVoiceMotionSemitones: 8,
});

describe('evaluateAttempt', () => {
  it('passes for correct pitch classes in lenient mode', () => {
    const result = evaluateAttempt({
      targetToken: token,
      playedNotes: token.midiVoicing,
      expectedTimeMs: 1000,
      submittedAtMs: 1060,
      scoringMode: 'lenient',
    });

    expect(result.success).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.accuracy).toBeGreaterThan(0.8);
  });

  it('fails standard mode on wrong bass for exact bass policy', () => {
    const wrongBass = [...token.midiVoicing].sort((a, b) => a - b);
    wrongBass[0] = wrongBass[0] + 1;

    const result = evaluateAttempt({
      targetToken: token,
      playedNotes: wrongBass,
      expectedTimeMs: 1000,
      submittedAtMs: 1000,
      scoringMode: 'standard',
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((error) => error.code === 'wrong_bass' || error.code === 'wrong_inversion')).toBe(true);
  });

  it('classifies timing errors as early/late', () => {
    const early = evaluateAttempt({
      targetToken: token,
      playedNotes: token.midiVoicing,
      expectedTimeMs: 1000,
      submittedAtMs: 700,
      scoringMode: 'lenient',
    });

    const late = evaluateAttempt({
      targetToken: token,
      playedNotes: token.midiVoicing,
      expectedTimeMs: 1000,
      submittedAtMs: 1400,
      scoringMode: 'lenient',
    });

    expect(early.timingBucket).toBe('early');
    expect(late.timingBucket).toBe('late');
  });

  it('accepts any matching selected flashcard voicing family at any octave', () => {
    const closed = buildChordToken({
      tonic: 'C',
      lane: 'ionian',
      roman: 'Imaj7',
      voicingFamily: 'closed_7th',
      midiRange: { min: 48, max: 72 },
      maxVoiceMotionSemitones: 8,
    });
    const inversion = buildChordToken({
      tonic: 'C',
      lane: 'ionian',
      roman: 'Imaj7',
      voicingFamily: 'inversion_1',
      midiRange: { min: 48, max: 72 },
      maxVoiceMotionSemitones: 8,
    });

    const result = evaluateFlashcardAttempt({
      acceptableTokens: [closed, inversion],
      playedNotes: inversion.midiVoicing.map((note) => note + 12),
      expectedTimeMs: 1000,
      submittedAtMs: 1000,
      scoringMode: 'standard',
    });

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
