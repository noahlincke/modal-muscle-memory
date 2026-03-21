import { describe, expect, it } from 'vitest';
import { generatePhrase } from './phraseGenerator';
import { createDefaultProgressState } from '../storage/progressStore';

function seededRandom(seed = 42): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

describe('phraseGenerator', () => {
  it('generates valid phrases with linked tokens', () => {
    const progress = createDefaultProgressState();
    const random = seededRandom(11);

    const phrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random,
    });

    expect(phrase.events.length).toBeGreaterThan(0);
    phrase.events.forEach((event) => {
      expect(phrase.tokensById[event.chordTokenId]).toBeDefined();
      expect(event.bar).toBeGreaterThan(0);
      expect(event.beat).toBeGreaterThan(0);
    });
  });

  it('can generate at least 30 unique starter phrases across MVP lanes', () => {
    const progress = createDefaultProgressState();
    const random = seededRandom(77);

    progress.unlocksByLane.ionian.roots = ['C', 'G', 'F'];
    progress.unlocksByLane.ionian.voicings = ['shell_137', 'closed_7th', 'inversion_1'];
    progress.unlocksByLane.aeolian.roots = ['A', 'E', 'D'];
    progress.unlocksByLane.aeolian.voicings = ['shell_137', 'closed_7th', 'inversion_1'];
    progress.unlocksByLane.ionian_aeolian_mixture.roots = ['C', 'G', 'F'];
    progress.unlocksByLane.ionian_aeolian_mixture.voicings = ['shell_137', 'closed_7th', 'inversion_1'];

    const signatures = new Set<string>();

    const lanes: Array<'ionian' | 'aeolian' | 'ionian_aeolian_mixture'> = [
      'ionian',
      'aeolian',
      'ionian_aeolian_mixture',
    ];

    lanes.forEach((lane) => {
      for (let i = 0; i < 90; i += 1) {
        progress.exerciseConfig.lane = lane;
        const phrase = generatePhrase({ config: progress.exerciseConfig, progress, tempo: 82, random });
        const signature = [
          lane,
          phrase.progressionId,
          phrase.tonic,
          phrase.events.map((event) => event.rhythmCellId).join('-'),
          phrase.events
            .map((event) => phrase.tokensById[event.chordTokenId].voicingFamily)
            .join('-'),
        ].join('|');

        signatures.add(signature);
      }
    });

    expect(signatures.size).toBeGreaterThanOrEqual(30);
  });

  it('expands selected rhythm cells into timed hits', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.rhythm = 'charleston';

    const phrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(7),
    });

    expect(phrase.events.length).toBe(phrase.progression.steps.length * 2);
    expect(phrase.events.every((event) => event.rhythmCellId === 'charleston')).toBe(true);
    expect(phrase.events.some((event) => event.beat === 2.5)).toBe(true);
  });

  it('can keep chained improvisation on the same loop when chain movement is low', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'improvisation';
    progress.exerciseConfig.improvisationProgressionMode = 'chained';
    progress.exerciseConfig.chainMovement = 0;

    const previousPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      focusOverride: 'due_review',
      random: () => 0,
    });

    const nextPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      previousPhrase,
      random: () => 0,
    });

    expect(nextPhrase.progressionId).toBe(previousPhrase.progressionId);
    expect(nextPhrase.tonic).toBe(previousPhrase.tonic);
  });

  it('can follow chain targets when chain movement is high', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'improvisation';
    progress.exerciseConfig.improvisationProgressionMode = 'chained';
    progress.exerciseConfig.chainMovement = 100;

    const previousPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      focusOverride: 'due_review',
      random: () => 0,
    });

    const nextPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      previousPhrase,
      random: () => 0.95,
    });

    expect(nextPhrase.progressionId).not.toBe(previousPhrase.progressionId);
    expect(previousPhrase.progression.chainTargets).toContain(nextPhrase.progressionId);
    expect(nextPhrase.tonic).toBe(previousPhrase.tonic);
  });
});
