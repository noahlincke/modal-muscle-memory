import { describe, expect, it } from 'vitest';
import { applyCurriculumPreset, curriculumPresetIdForLane } from '../../content/curriculum';
import { rootsForKeySet } from '../../content/keys';
import {
  countMatchingProgressions,
  countPotentialProgressions,
  generatePhrase,
  listPotentialPhraseVariants,
  playableProgressionIds,
} from './phraseGenerator';
import { createDefaultProgressState } from '../storage/progressStore';

function seededRandom(seed = 42): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

describe('phraseGenerator', () => {
  it('can generate guide-tone preset phrases with guide-tone and rootless families', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig = applyCurriculumPreset(progress.exerciseConfig, 'guide_tone_foundations');

    const phrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(5),
    });

    expect([
      'guide_tone_37',
      'guide_tone_73',
      'rootless_379',
      'rootless_7313',
    ]).toContain(phrase.tokensById[phrase.events[0].chordTokenId].voicingFamily);
    expect([
      'guide_tone_ii_v_i',
      'guide_tone_turnaround_cycle',
      'guide_tone_circle_fragment',
      'guide_tone_rootless_resolution',
      'guide_tone_rootless_circle',
    ]).toContain(phrase.progressionId);
  });

  it('keeps all guide-tone foundation progressions playable before any voicing unlocks', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig = applyCurriculumPreset(progress.exerciseConfig, 'guide_tone_foundations');

    expect(playableProgressionIds(progress.exerciseConfig, progress)).toEqual([
      'guide_tone_ii_v_i',
      'guide_tone_turnaround_cycle',
      'guide_tone_circle_fragment',
      'guide_tone_rootless_resolution',
      'guide_tone_rootless_circle',
    ]);
  });

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

  it('places guided progressions higher in treble than bass for hand comfort', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig = applyCurriculumPreset(progress.exerciseConfig, 'guide_tone_foundations');

    const treblePhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress: {
        ...progress,
        settings: {
          ...progress.settings,
          staffClef: 'treble',
          registerMin: 60,
          registerMax: 84,
        },
      },
      tempo: 78,
      random: seededRandom(19),
      progressionOverrideId: 'guide_tone_ii_v_i',
      tonicOverride: 'Bb',
      voicingFamilyOverride: 'guide_tone_37',
    });
    const bassPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress: {
        ...progress,
        settings: {
          ...progress.settings,
          staffClef: 'bass',
          registerMin: 31,
          registerMax: 55,
        },
      },
      tempo: 78,
      random: seededRandom(19),
      progressionOverrideId: 'guide_tone_ii_v_i',
      tonicOverride: 'Bb',
      voicingFamilyOverride: 'guide_tone_37',
    });

    const treblePredominant = treblePhrase.tokensById[
      treblePhrase.events.find((event) => event.progressionStepIndex === 0)?.chordTokenId ?? ''
    ];
    const bassPredominant = bassPhrase.tokensById[
      bassPhrase.events.find((event) => event.progressionStepIndex === 0)?.chordTokenId ?? ''
    ];

    expect(treblePredominant.symbol).toBe('Cm7');
    expect(bassPredominant.symbol).toBe('Cm7');
    expect(treblePredominant.midiVoicing[0] - bassPredominant.midiVoicing[0]).toBeGreaterThanOrEqual(12);
    expect(treblePredominant.midiVoicing[0]).toBeGreaterThanOrEqual(72);
    expect(treblePredominant.midiVoicing[treblePredominant.midiVoicing.length - 1] - treblePredominant.midiVoicing[0]).toBeLessThanOrEqual(12);
    expect(bassPredominant.midiVoicing[bassPredominant.midiVoicing.length - 1] - bassPredominant.midiVoicing[0]).toBeLessThanOrEqual(12);
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

  it('expands selected rhythm cells into landing events in improvisation mode', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'improvisation';
    progress.exerciseConfig.rhythm = ['charleston'];

    const phrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(9),
    });

    expect(phrase.events.length).toBe(phrase.progression.steps.length * 2);
    expect(phrase.events.every((event) => event.rhythmCellId === 'charleston')).toBe(true);
    expect(phrase.events.some((event) => event.beat === 2.5)).toBe(true);
    expect(phrase.events.every((event) => event.rhythmCellId === 'charleston')).toBe(true);
  });

  it('builds single-card flashcard phrases from the existing filtered pool', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'chord_flashcards';
    progress.exerciseConfig.flashcardFlowMode = 'mixed_recall';
    progress.exerciseConfig.selectedVoicings = ['closed_7th', 'inversion_1', 'inversion_2'];

    const phrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(31),
    });

    const token = phrase.tokensById[phrase.events[0].chordTokenId];

    expect(phrase.events).toHaveLength(1);
    expect(phrase.id).toContain(':chord_flashcards:');
    expect(token).toBeDefined();
    expect(['closed_7th', 'inversion_1', 'inversion_2']).toContain(token.voicingFamily);
    expect(playableProgressionIds(progress.exerciseConfig, progress)).toContain(phrase.progressionId);
  });

  it('prefers closed 7th for flashcard display even when an inversion override is supplied', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'chord_flashcards';
    progress.exerciseConfig.flashcardFlowMode = 'mixed_recall';
    progress.exerciseConfig.selectedVoicings = ['closed_7th', 'inversion_1'];

    const phrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(17),
      progressionOverrideId: 'ionian_turnaround',
      tonicOverride: 'C',
      voicingFamilyOverride: 'inversion_1',
    });

    const token = phrase.tokensById[phrase.events[0].chordTokenId];

    expect(token.voicingFamily).toBe('closed_7th');
  });

  it('lets mixed-recall flashcards move keys when movement is high', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'chord_flashcards';
    progress.exerciseConfig.flashcardFlowMode = 'mixed_recall';
    progress.exerciseConfig.chainMovement = 100;
    progress.exerciseConfig.keySet = 'max_2_accidentals';
    progress.exerciseConfig.includedKeyRoots = rootsForKeySet('max_2_accidentals');
    progress.exerciseConfig.selectedVoicings = ['closed_7th', 'inversion_1', 'inversion_2'];

    const firstPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(41),
    });

    const secondPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(43),
      previousPhrase: firstPhrase,
    });

    expect(progress.exerciseConfig.includedKeyRoots).toContain(firstPhrase.tonic);
    expect(progress.exerciseConfig.includedKeyRoots).toContain(secondPhrase.tonic);
    expect(secondPhrase.tonic).not.toBe(firstPhrase.tonic);
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

  it('counts unique progressions without multiplying rhythm variants', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.selectedVoicings = ['shell_137'];

    const allRhythmVariants = listPotentialPhraseVariants(progress);
    const allRhythmCount = countPotentialProgressions(progress);

    progress.exerciseConfig.rhythm = ['charleston', 'quarters'];

    expect(countPotentialProgressions(progress)).toBe(allRhythmCount);
    expect(listPotentialPhraseVariants(progress)).toEqual(allRhythmVariants);
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
    expect(rootsForKeySet(progress.exerciseConfig.keySet)).toContain(nextPhrase.tonic);
  });

  it('can move to other allowed keys during chained flow when movement is high', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'improvisation';
    progress.exerciseConfig.improvisationProgressionMode = 'chained';
    progress.exerciseConfig.chainMovement = 100;
    progress.exerciseConfig.keySet = 'max_2_accidentals';

    let previousPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(19),
    });

    const tonics = new Set<string>([previousPhrase.tonic]);
    const random = seededRandom(41);

    for (let index = 0; index < 10; index += 1) {
      const nextPhrase = generatePhrase({
        config: progress.exerciseConfig,
        progress,
        tempo: 78,
        previousPhrase,
        random,
      });

      tonics.add(nextPhrase.tonic);
      previousPhrase = nextPhrase;
    }

    expect(tonics.size).toBeGreaterThan(1);
  });

  it('respects a custom included key set when generating phrases', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.keySet = 'custom';
    progress.exerciseConfig.includedKeyRoots = ['Bb'];

    const phrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(23),
    });

    expect(phrase.tonic).toBe('Bb');
  });

  it('keeps the requested progression when a tonic override is also provided', () => {
    const progress = createDefaultProgressState();

    const initialPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(13),
    });

    const keyedPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      progressionOverrideId: initialPhrase.progressionId,
      tonicOverride: 'G',
      voicingFamilyOverride: initialPhrase.tokensById[initialPhrase.events[0].chordTokenId].voicingFamily,
      random: seededRandom(41),
    });

    expect(keyedPhrase.progressionId).toBe(initialPhrase.progressionId);
    expect(keyedPhrase.tonic).toBe('G');
  });

  it('returns no potential phrase variants when the custom key set is empty', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.keySet = 'custom';
    progress.exerciseConfig.includedKeyRoots = [];

    expect(listPotentialPhraseVariants(progress)).toEqual([]);
    expect(countPotentialProgressions(progress)).toBe(0);
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
    expect(rootsForKeySet(progress.exerciseConfig.keySet)).toContain(nextPhrase.tonic);
  });

  it('can break out of a tiny recent chain loop when flow motion is high', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.mode = 'guided';
    progress.exerciseConfig.guidedFlowMode = 'musical_chaining';
    progress.exerciseConfig.chainMovement = 100;

    const previousPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(5),
    });

    previousPhrase.progressionId = 'ionian_turnaround';
    previousPhrase.progression = {
      ...previousPhrase.progression,
      id: 'ionian_turnaround',
      chainTargets: ['ionian_cadence_return', 'ionian_predominant', 'ionian_scalar_up'],
    };

    progress.sessionHistory = [
      {
        id: 'loop-1',
        mode: 'guided',
        curriculumPresetId: progress.exerciseConfig.curriculumPresetId,
        lane: 'ionian',
        startedAt: new Date('2026-03-21T10:00:00.000Z').toISOString(),
        endedAt: new Date('2026-03-21T10:01:00.000Z').toISOString(),
        phraseIds: [
          'phrase:guided:ionian:musical_chaining:ionian_turnaround:C:shell_137:1',
          'phrase:guided:ionian:musical_chaining:ionian_cadence_return:C:shell_137:2',
          'phrase:guided:ionian:musical_chaining:ionian_turnaround:C:shell_137:3',
          'phrase:guided:ionian:musical_chaining:ionian_cadence_return:C:shell_137:4',
          'phrase:guided:ionian:musical_chaining:ionian_turnaround:C:shell_137:5',
          'phrase:guided:ionian:musical_chaining:ionian_cadence_return:C:shell_137:6',
        ],
        accuracy: 0.64,
        medianTransitionLatencyMs: 520,
      },
    ];

    const nextPhrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      previousPhrase,
      random: () => 0.1,
    });

    expect(['ionian_turnaround', 'ionian_cadence_return']).not.toContain(nextPhrase.progressionId);
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

  it('can still stay on the weakest recent phrase when flow motion is low', () => {
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
        id: 'session-weak-1',
        mode: progress.exerciseConfig.mode,
        curriculumPresetId: progress.exerciseConfig.curriculumPresetId,
        lane: strongerPhrase.lane,
        startedAt: new Date('2026-03-21T09:00:00.000Z').toISOString(),
        endedAt: new Date('2026-03-21T09:01:00.000Z').toISOString(),
        phraseIds: [strongerPhrase.id],
        accuracy: 0.95,
        medianTransitionLatencyMs: 380,
      },
      {
        id: 'session-weak-2',
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
      previousPhrase: weakerPhrase,
      random: seededRandom(91),
    });

    expect(nextPhrase.progressionId).toBe(weakerPhrase.progressionId);
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

  it('filters progressions to the selected voicings that the current content actually supports', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig = applyCurriculumPreset(progress.exerciseConfig, 'modal_colors');
    progress.exerciseConfig.selectedVoicings = ['inversion_1'];
    progress.unlocksByLane.dorian.roots = ['D'];
    progress.unlocksByLane.mixolydian.roots = ['G'];
    progress.unlocksByLane.lydian.roots = ['F'];
    progress.unlocksByLane.phrygian.roots = ['E'];

    const ids = playableProgressionIds(progress.exerciseConfig, progress);

    expect(ids).toContain('dorian_modal_pivot');
    expect(ids).not.toContain('phrygian_pedal_turn');
  });

  it('can generate guide-tone rootless phrases before rootless voicings are unlocked', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig = applyCurriculumPreset(progress.exerciseConfig, 'guide_tone_foundations');
    progress.exerciseConfig.selectedVoicings = ['rootless_379'];

    const phrase = generatePhrase({
      config: progress.exerciseConfig,
      progress,
      tempo: 78,
      random: seededRandom(303),
    });

    const firstToken = phrase.tokensById[phrase.events[0].chordTokenId];

    expect(firstToken.voicingFamily).toBe('rootless_379');
    expect(['guide_tone_rootless_resolution', 'guide_tone_rootless_circle']).toContain(phrase.progressionId);
  });
});
