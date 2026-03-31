import { describe, expect, it } from 'vitest';
import { buildChordToken } from '../theory/chordToken';
import { evaluateImprovisationAttempt } from './improvisationEvaluator';

const token = buildChordToken({
  tonic: 'C',
  lane: 'ionian',
  roman: 'ii7',
  voicingFamily: 'closed_7th',
  midiRange: { min: 48, max: 72 },
  maxVoiceMotionSemitones: 8,
});

describe('evaluateImprovisationAttempt', () => {
  it('passes when the chord lands on time inside the allowed scale space', () => {
    const result = evaluateImprovisationAttempt({
      targetToken: token,
      playedNotes: token.midiVoicing,
      allowedPitchClasses: ['D', 'E', 'F', 'G', 'A', 'B', 'C'],
      expectedTimeMs: 1000,
      submittedAtMs: 1080,
      scoringMode: 'lenient',
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes when the exact voicing is played at another octave', () => {
    const result = evaluateImprovisationAttempt({
      targetToken: token,
      playedNotes: token.midiVoicing.map((note) => note + 12),
      allowedPitchClasses: ['D', 'E', 'F', 'G', 'A', 'B', 'C'],
      expectedTimeMs: 1000,
      submittedAtMs: 1080,
      scoringMode: 'lenient',
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when the chord is spread across mixed octaves', () => {
    const result = evaluateImprovisationAttempt({
      targetToken: token,
      playedNotes: [
        token.midiVoicing[0] - 12,
        token.midiVoicing[1],
        token.midiVoicing[2] + 12,
        token.midiVoicing[3],
      ],
      allowedPitchClasses: ['D', 'E', 'F', 'G', 'A', 'B', 'C'],
      expectedTimeMs: 1000,
      submittedAtMs: 1080,
      scoringMode: 'lenient',
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((error) => error.code === 'wrong_target_notes')).toBe(true);
  });

  it('fails when extra notes fall outside the allowed scale space', () => {
    const result = evaluateImprovisationAttempt({
      targetToken: token,
      playedNotes: [...token.midiVoicing, 61],
      allowedPitchClasses: ['D', 'E', 'F', 'G', 'A', 'B', 'C'],
      expectedTimeMs: 1000,
      submittedAtMs: 1080,
      scoringMode: 'lenient',
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((error) => error.code === 'outside_allowed_scale')).toBe(true);
  });

  it('passes when the target voicing is present alongside other allowed scale notes', () => {
    const result = evaluateImprovisationAttempt({
      targetToken: token,
      playedNotes: [...token.midiVoicing, 60],
      allowedPitchClasses: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
      expectedTimeMs: 1000,
      submittedAtMs: 1080,
      scoringMode: 'lenient',
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
