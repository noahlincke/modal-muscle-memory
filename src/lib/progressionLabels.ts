import type { ProgressionDefinition } from '../types/music';

export function humanizeSnakeCase(value: string): string {
  return value
    .split('_')
    .map((word) => {
      if (word === 'up' || word === 'down') {
        return `${word[0].toUpperCase()}${word.slice(1)}`;
      }

      return word.length <= 2 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`;
    })
    .join(' ');
}

export function progressionSubtitle(progressionId: string): string {
  return humanizeSnakeCase(progressionId);
}

export function progressionRomanSummary(progression: ProgressionDefinition): string {
  return progression.steps.map((step) => step.roman).join(' -> ');
}
