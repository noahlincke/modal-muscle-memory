import type { PhraseFocusType } from '../../types/music';
import type { ProgressState } from '../../types/progress';

interface SchedulerInput {
  progress: ProgressState;
  difficulty: number;
  random?: () => number;
}

const DEFAULT_WEIGHTS: Record<PhraseFocusType, number> = {
  weak_transition: 0.4,
  weak_node: 0.25,
  due_review: 0.2,
  new_item: 0.15,
};

const BEGINNER_WEIGHTS: Record<PhraseFocusType, number> = {
  weak_transition: 0.25,
  weak_node: 0.55,
  due_review: 0.15,
  new_item: 0.05,
};

function weightedChoice(
  weights: Record<PhraseFocusType, number>,
  random: () => number,
): PhraseFocusType {
  const roll = random();
  let cursor = 0;

  for (const [key, weight] of Object.entries(weights)) {
    cursor += weight;
    if (roll <= cursor) {
      return key as PhraseFocusType;
    }
  }

  return 'weak_node';
}

export function hasWeakNode(progress: ProgressState): boolean {
  return Object.values(progress.nodeMastery).some((stat) => stat.attempts >= 3 && stat.accuracyEwma < 0.8);
}

export function hasWeakTransition(progress: ProgressState): boolean {
  return Object.values(progress.edgeMastery).some((stat) => stat.attempts >= 3 && stat.accuracyEwma < 0.8);
}

export function hasDueReview(progress: ProgressState): boolean {
  const now = Date.now();
  return progress.recentAttempts.some((attempt) => now - new Date(attempt.at).getTime() > 1000 * 60 * 60 * 24);
}

export function choosePhraseFocus({
  progress,
  difficulty,
  random = Math.random,
}: SchedulerInput): PhraseFocusType {
  const baseline = difficulty <= 1 ? BEGINNER_WEIGHTS : DEFAULT_WEIGHTS;
  const weights = { ...baseline };

  if (!hasWeakNode(progress)) {
    weights.weak_node *= 0.5;
  }
  if (!hasWeakTransition(progress)) {
    weights.weak_transition *= 0.5;
  }
  if (!hasDueReview(progress)) {
    weights.due_review *= 0.35;
  }

  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const normalized = {
    weak_transition: weights.weak_transition / total,
    weak_node: weights.weak_node / total,
    due_review: weights.due_review / total,
    new_item: weights.new_item / total,
  };

  return weightedChoice(normalized, random);
}
