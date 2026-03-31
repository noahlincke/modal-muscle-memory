import type { ChordToken, EventAttemptInput, EvaluationResult, ScoringError } from '../../types/music';
import { midiToPitchClass } from '../theory/noteUtils';

const DEFAULT_TOLERANCES = {
  earlyMs: 180,
  lateMs: 220,
};

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function timingBucket(deltaMs: number, earlyMs: number, lateMs: number): EvaluationResult['timingBucket'] {
  if (deltaMs < -earlyMs) return 'early';
  if (deltaMs > lateMs) return 'late';
  return 'on_time';
}

function expectedBassPitchClass(token: EventAttemptInput['targetToken']): string {
  const lowest = token.midiVoicing[0];
  return midiToPitchClass(lowest);
}

export function evaluateAttempt(input: EventAttemptInput): EvaluationResult {
  const tolerances = input.tolerances ?? DEFAULT_TOLERANCES;
  const deltaMs = input.submittedAtMs - input.expectedTimeMs;
  const bucket = timingBucket(deltaMs, tolerances.earlyMs, tolerances.lateMs);

  const playedPitchClasses = unique(input.playedNotes.map((note) => midiToPitchClass(note)));
  const required = unique(input.targetToken.requiredPitchClasses);
  const optional = unique(input.targetToken.optionalPitchClasses);
  const allowed = new Set([...required, ...optional]);

  const matchedRequired = required.filter((note) => playedPitchClasses.includes(note));
  const missingRequired = required.filter((note) => !playedPitchClasses.includes(note));
  const wrongPitchClasses = playedPitchClasses.filter((note) => !allowed.has(note));

  const errors: ScoringError[] = [];

  if (bucket === 'early') {
    errors.push({ code: 'early', message: 'Played too early.' });
  }
  if (bucket === 'late') {
    errors.push({ code: 'late', message: 'Played too late.' });
  }

  if (missingRequired.length > 0) {
    errors.push({
      code: 'missing_required_tone',
      message: `Missing required tones: ${missingRequired.join(', ')}`,
    });
  }

  if (wrongPitchClasses.length > 0) {
    errors.push({
      code: 'wrong_pitch_class',
      message: `Wrong pitch classes: ${wrongPitchClasses.join(', ')}`,
    });
  }

  if (input.previousEventEndNotes && input.previousEventEndNotes.length > 0) {
    const carriedOver = input.previousEventEndNotes
      .map((note) => midiToPitchClass(note))
      .filter((pc) => !required.includes(pc) && !optional.includes(pc));
    if (carriedOver.length > 0) {
      errors.push({
        code: 'carried_over_notes',
        message: `Carried-over notes from prior chord: ${unique(carriedOver).join(', ')}`,
      });
    }
  }

  if (input.scoringMode !== 'lenient' && input.playedNotes.length > 0) {
    const lowestPlayed = Math.min(...input.playedNotes);
    const lowestPitchClass = midiToPitchClass(lowestPlayed);

    if (input.targetToken.bassPolicy === 'exact') {
      const expectedBass = expectedBassPitchClass(input.targetToken);
      if (lowestPitchClass !== expectedBass) {
        errors.push({
          code: 'wrong_bass',
          message: `Expected bass ${expectedBass}, got ${lowestPitchClass}`,
        });
      }
    }

    if (
      input.targetToken.inversion === 1
      && lowestPitchClass !== midiToPitchClass(input.targetToken.midiVoicing[0])
    ) {
      errors.push({
        code: 'wrong_inversion',
        message: 'First inversion expected for this token.',
      });
    }
  }

  const requiredRatio = matchedRequired.length / Math.max(required.length, 1);
  const wrongPenalty = wrongPitchClasses.length * 0.15;
  const timingPenalty = bucket === 'on_time' ? 0 : 0.08;
  const rawAccuracy = requiredRatio - wrongPenalty - timingPenalty;
  const accuracy = Math.max(0, Math.min(1, rawAccuracy));

  const structuralErrors = errors.filter((error) =>
    ['wrong_pitch_class', 'missing_required_tone', 'wrong_bass', 'wrong_inversion'].includes(error.code),
  );

  const success = structuralErrors.length === 0 && bucket === 'on_time';

  return {
    success,
    timingDeltaMs: deltaMs,
    timingBucket: bucket,
    accuracy,
    latencyMs: Math.abs(deltaMs),
    matchedRequired: matchedRequired.length,
    errors,
  };
}

interface FlashcardAttemptInput extends Omit<EventAttemptInput, 'targetToken'> {
  acceptableTokens: ChordToken[];
}

function betterFlashcardResult(candidate: EvaluationResult, current: EvaluationResult | null): boolean {
  if (!current) {
    return true;
  }

  if (candidate.success !== current.success) {
    return candidate.success;
  }

  if (candidate.accuracy !== current.accuracy) {
    return candidate.accuracy > current.accuracy;
  }

  if (candidate.errors.length !== current.errors.length) {
    return candidate.errors.length < current.errors.length;
  }

  return candidate.latencyMs < current.latencyMs;
}

export function evaluateFlashcardAttempt(input: FlashcardAttemptInput): EvaluationResult {
  let bestResult: EvaluationResult | null = null;

  input.acceptableTokens.forEach((targetToken) => {
    const candidate = evaluateAttempt({
      ...input,
      targetToken,
    });

    if (betterFlashcardResult(candidate, bestResult)) {
      bestResult = candidate;
    }
  });

  return bestResult ?? {
    success: false,
    timingDeltaMs: 0,
    timingBucket: 'on_time',
    accuracy: 0,
    latencyMs: 0,
    matchedRequired: 0,
    errors: [{
      code: 'wrong_target_notes',
      message: 'No accepted flashcard voicings are available for this chord.',
    }],
  };
}
