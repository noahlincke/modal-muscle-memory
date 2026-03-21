import type { EventAttemptInput, EvaluationResult, ScoringError } from '../../types/music';
import { midiToPitchClass } from '../theory/noteUtils';

const DEFAULT_TOLERANCES = {
  earlyMs: 220,
  lateMs: 320,
};

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function sameNotes(a: number[], b: number[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const sortedA = [...a].sort((left, right) => left - right);
  const sortedB = [...b].sort((left, right) => left - right);
  return sortedA.every((note, index) => note === sortedB[index]);
}

function timingBucket(deltaMs: number, earlyMs: number, lateMs: number): EvaluationResult['timingBucket'] {
  if (deltaMs < -earlyMs) return 'early';
  if (deltaMs > lateMs) return 'late';
  return 'on_time';
}

interface ImprovisationAttemptInput extends EventAttemptInput {
  allowedPitchClasses: string[];
}

export function evaluateImprovisationAttempt(input: ImprovisationAttemptInput): EvaluationResult {
  const tolerances = input.tolerances ?? DEFAULT_TOLERANCES;
  const deltaMs = input.submittedAtMs - input.expectedTimeMs;
  const bucket = timingBucket(deltaMs, tolerances.earlyMs, tolerances.lateMs);

  const playedPitchClasses = unique(input.playedNotes.map((note) => midiToPitchClass(note)));
  const required = unique(input.targetToken.requiredPitchClasses);
  const allowed = new Set(unique([...required, ...input.allowedPitchClasses]));
  const exactTargetMatch = sameNotes(input.playedNotes, input.targetToken.midiVoicing);

  const matchedRequired = required.filter((pitchClass) => playedPitchClasses.includes(pitchClass));
  const missingRequired = required.filter((pitchClass) => !playedPitchClasses.includes(pitchClass));
  const outsideAllowed = playedPitchClasses.filter((pitchClass) => !allowed.has(pitchClass));

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
  if (!exactTargetMatch) {
    errors.push({
      code: 'wrong_target_notes',
      message: 'Play the exact notated voicing to advance.',
    });
  }
  if (outsideAllowed.length > 0) {
    errors.push({
      code: 'outside_allowed_scale',
      message: `Outside allowed scale tones: ${outsideAllowed.join(', ')}`,
    });
  }

  const requiredRatio = matchedRequired.length / Math.max(required.length, 1);
  const outsidePenalty = outsideAllowed.length * 0.12;
  const timingPenalty = bucket === 'on_time' ? 0 : 0.06;
  const accuracy = Math.max(0, Math.min(1, requiredRatio - outsidePenalty - timingPenalty));

  return {
    success: missingRequired.length === 0 && exactTargetMatch && outsideAllowed.length === 0 && bucket === 'on_time',
    timingDeltaMs: deltaMs,
    timingBucket: bucket,
    accuracy,
    latencyMs: Math.abs(deltaMs),
    matchedRequired: matchedRequired.length,
    errors,
  };
}
