import { describe, expect, it } from 'vitest';
import { applyCurriculumPreset, curriculumPresetIdForLane } from '../../content/curriculum';
import { countMatchingProgressions, generatePhrase } from './phraseGenerator';
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
        progress.exerciseConfig = applyCurriculumPreset(
          progress.exerciseConfig,
          curriculumPresetIdForLane(lane),
        );
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
    progress.exerciseConfig.rhythm = ['charleston'];

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

  it('keeps improvisation on one landing event per progression step', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'improvisation';
    progress.exerciseConfig.rhythm = ['charleston'];

    const phrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(9),
    });

    expect(phrase.events.length).toBe(phrase.progression.steps.length);
    expect(phrase.events.every((event) => event.beat === 1)).toBe(true);
    expect(phrase.events.every((event) => event.durationBeats === 4)).toBe(true);
    expect(phrase.events.every((event) => event.rhythmCellId === 'charleston')).toBe(true);
  });

  it('reports zero matching progressions when the selected filters have no overlap', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.enabledContentBlockIds = ['major_foundations'];
    progress.exerciseConfig.enabledScaleFamilyIds = ['symmetric_family'];
    progress.exerciseConfig.enabledProgressionFamilyTags = ['symmetric_color'];

    expect(countMatchingProgressions(progress.exerciseConfig)).toBe(0);
  });

  it('reports zero matching progressions when a filter group is cleared entirely', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.enabledScaleFamilyIds = [];

    expect(countMatchingProgressions(progress.exerciseConfig)).toBe(0);
  });

  it('can mix multiple rhythm filters in guided mode', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.rhythm = ['block_whole', 'charleston'];

    const phrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(23),
    });

    expect(phrase.events.every((event) => ['block_whole', 'charleston'].includes(event.rhythmCellId))).toBe(true);
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

  it('can keep guided chaining on the same loop when flow motion is low', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'guided';
    progress.exerciseConfig.guidedFlowMode = 'musical_chaining';
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

  it('can follow chain targets in guided mode when flow motion is high', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'guided';
    progress.exerciseConfig.guidedFlowMode = 'musical_chaining';
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

  it('targets the weakest recent guided phrase when improvement mode is selected', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'guided';
    progress.exerciseConfig.guidedFlowMode = 'targeting_improvement';
    progress.exerciseConfig.chainMovement = 0;

    const weakerPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(13),
    });
    const strongerPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(27),
    });

    progress.sessionHistory = [
      {
        id: 'session-1',
        mode: progress.exerciseConfig.mode,
        curriculumPresetId: progress.exerciseConfig.curriculumPresetId,
        lane: strongerPhrase.lane,
        startedAt: new Date('2026-03-21T09:00:00.000Z').toISOString(),
        endedAt: new Date('2026-03-21T09:01:00.000Z').toISOString(),
        phraseIds: [strongerPhrase.id],
        accuracy: 0.92,
        medianTransitionLatencyMs: 420,
      },
      {
        id: 'session-2',
        mode: progress.exerciseConfig.mode,
        curriculumPresetId: progress.exerciseConfig.curriculumPresetId,
        lane: weakerPhrase.lane,
        startedAt: new Date('2026-03-21T09:02:00.000Z').toISOString(),
        endedAt: new Date('2026-03-21T09:03:00.000Z').toISOString(),
        phraseIds: [weakerPhrase.id],
        accuracy: 0.41,
        medianTransitionLatencyMs: 760,
      },
    ];

    const nextPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(91),
    });

    const nextVoicing = nextPhrase.tokensById[nextPhrase.events[0].chordTokenId].voicingFamily;
    const weakerVoicing = weakerPhrase.tokensById[weakerPhrase.events[0].chordTokenId].voicingFamily;

    expect(nextPhrase.progressionId).toBe(weakerPhrase.progressionId);
    expect(nextPhrase.tonic).toBe(weakerPhrase.tonic);
    expect(nextVoicing).toBe(weakerVoicing);
  });

  it('targets the weakest recent improvisation phrase when improvement mode is selected', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'improvisation';
    progress.exerciseConfig.improvisationProgressionMode = 'targeting_improvement';
    progress.exerciseConfig.chainMovement = 0;

    const weakerPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(31),
    });
    const strongerPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(47),
    });

    progress.sessionHistory = [
      {
        id: 'session-3',
        mode: progress.exerciseConfig.mode,
        curriculumPresetId: progress.exerciseConfig.curriculumPresetId,
        lane: strongerPhrase.lane,
        startedAt: new Date('2026-03-21T09:05:00.000Z').toISOString(),
        endedAt: new Date('2026-03-21T09:06:00.000Z').toISOString(),
        phraseIds: [strongerPhrase.id],
        accuracy: 0.95,
        medianTransitionLatencyMs: 390,
      },
      {
        id: 'session-4',
        mode: progress.exerciseConfig.mode,
        curriculumPresetId: progress.exerciseConfig.curriculumPresetId,
        lane: weakerPhrase.lane,
        startedAt: new Date('2026-03-21T09:07:00.000Z').toISOString(),
        endedAt: new Date('2026-03-21T09:08:00.000Z').toISOString(),
        phraseIds: [weakerPhrase.id],
        accuracy: 0.38,
        medianTransitionLatencyMs: 810,
      },
    ];

    const nextPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(101),
    });

    expect(nextPhrase.progressionId).toBe(weakerPhrase.progressionId);
    expect(nextPhrase.tonic).toBe(weakerPhrase.tonic);
  });
});
