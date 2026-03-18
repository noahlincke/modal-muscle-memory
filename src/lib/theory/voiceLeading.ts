import { midiCandidatesForPitchClass } from './noteUtils';

interface VoiceLeadingInput {
  orderedPitchClasses: string[];
  midiRange: { min: number; max: number };
  prevVoicing?: number[];
  maxMotionSemitones: number;
}

function nearestCandidate(
  candidates: number[],
  target: number,
  minAllowed: number,
): number {
  const valid = candidates.filter((value) => value > minAllowed);
  if (valid.length === 0) {
    return candidates[candidates.length - 1];
  }

  return valid.reduce((best, current) => {
    const bestDistance = Math.abs(best - target);
    const currentDistance = Math.abs(current - target);
    return currentDistance < bestDistance ? current : best;
  }, valid[0]);
}

function totalMotion(current: number[], previous: number[]): number {
  const count = Math.min(current.length, previous.length);
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    total += Math.abs(current[i] - previous[i]);
  }
  return total;
}

export function solveVoiceLeading({
  orderedPitchClasses,
  midiRange,
  prevVoicing,
  maxMotionSemitones,
}: VoiceLeadingInput): number[] {
  const center = (midiRange.min + midiRange.max) / 2;
  let last = midiRange.min - 1;
  const chosen: number[] = [];

  orderedPitchClasses.forEach((pitchClass, index) => {
    const candidates = midiCandidatesForPitchClass(
      pitchClass,
      midiRange.min,
      midiRange.max,
    );
    const target = prevVoicing?.[index] ?? center + index * 3;
    const next = nearestCandidate(candidates, target, last);
    chosen.push(next);
    last = next;
  });

  if (prevVoicing && prevVoicing.length > 0) {
    const motion = totalMotion(chosen, prevVoicing);
    if (motion > maxMotionSemitones * chosen.length) {
      const shiftedDown = chosen.map((note) => note - 12).filter((note) => note >= midiRange.min);
      const shiftedUp = chosen.map((note) => note + 12).filter((note) => note <= midiRange.max);

      const currentMotion = totalMotion(chosen, prevVoicing);
      const downMotion = shiftedDown.length === chosen.length ? totalMotion(shiftedDown, prevVoicing) : Number.POSITIVE_INFINITY;
      const upMotion = shiftedUp.length === chosen.length ? totalMotion(shiftedUp, prevVoicing) : Number.POSITIVE_INFINITY;

      if (downMotion < currentMotion && downMotion <= upMotion) {
        return shiftedDown;
      }
      if (upMotion < currentMotion && upMotion < downMotion) {
        return shiftedUp;
      }
    }
  }

  return chosen;
}
