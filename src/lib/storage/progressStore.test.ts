import { describe, expect, it } from 'vitest';
import {
  createDefaultProgressState,
  loadProgressState,
  pushSession,
  saveProgressState,
} from './progressStore';

describe('progressStore', () => {
  it('persists and reloads progress', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.lane = 'aeolian';
    progress.exerciseConfig.curriculumPresetId = 'minor_foundations';
    progress.exerciseConfig.mode = 'improvisation';
    progress.exerciseConfig.guidedFlowMode = 'musical_chaining';
    progress.exerciseConfig.improvisationProgressionMode = 'chained';
    progress.exerciseConfig.improvisationAdvanceMode = 'footpedal_release';
    progress.exerciseConfig.chainMovement = 72;
    progress.settings.enableComputerKeyboardAudio = false;
    progress.settings.keyboardFriendlyVoicings = false;
    progress.settings.practiceTrackingMode = 'play';
    progress.nodeMastery['ionian:C:Imaj7:shell_137:0:v1'] = {
      attempts: 4,
      successes: 3,
      accuracyEwma: 0.81,
      latencyEwmaMs: 720,
      lastSeenAt: new Date().toISOString(),
      intervalBucket: 2,
    };

    saveProgressState(progress);
    const loaded = loadProgressState();

    expect(loaded.exerciseConfig.lane).toBe('aeolian');
    expect(loaded.exerciseConfig.curriculumPresetId).toBe('minor_foundations');
    expect(loaded.exerciseConfig.guidedFlowMode).toBe('musical_chaining');
    expect(loaded.exerciseConfig.improvisationProgressionMode).toBe('chained');
    expect(loaded.exerciseConfig.improvisationAdvanceMode).toBe('footpedal_release');
    expect(loaded.exerciseConfig.chainMovement).toBe(72);
    expect(loaded.settings.scaleGuideLabelMode).toBe('degrees');
    expect(loaded.settings.enableComputerKeyboardAudio).toBe(false);
    expect(loaded.settings.keyboardFriendlyVoicings).toBe(false);
    expect(loaded.settings.practiceTrackingMode).toBe('play');
    expect(loaded.nodeMastery['ionian:C:Imaj7:shell_137:0:v1']).toBeDefined();
  });

  it('merges unlock defaults and keeps existing mastery data', () => {
    window.localStorage.setItem(
      'modal-muscle-memory-progress',
      JSON.stringify({
        exerciseConfig: {
          mode: 'guided',
          curriculumPresetId: 'major_foundations',
          lane: 'ionian',
          rhythm: ['all'],
          guidedFlowMode: 'musical_chaining',
          improvisationProgressionMode: 'chained',
          improvisationAdvanceMode: 'footpedal_release',
          chainMovement: 180,
        },
        unlocksByLane: {
          ionian: {
            roots: ['C'],
            modes: ['ionian'],
            voicings: ['shell_137'],
            rhythms: ['block_whole'],
            borrowedDepth: 0,
            unlockedPackIds: [],
          },
        },
        nodeMastery: {
          'ionian:C:Imaj7:shell_137:0:v1': {
            attempts: 8,
            successes: 7,
            accuracyEwma: 0.88,
            latencyEwmaMs: 640,
            lastSeenAt: new Date().toISOString(),
            intervalBucket: 3,
          },
        },
      }),
    );

    const loaded = loadProgressState();

    expect(loaded.unlocksByLane.ionian.unlockedPackIds.length).toBeGreaterThan(0);
    expect(loaded.exerciseConfig.curriculumPresetId).toBe('major_foundations');
    expect(loaded.exerciseConfig.guidedFlowMode).toBe('musical_chaining');
    expect(loaded.exerciseConfig.improvisationProgressionMode).toBe('chained');
    expect(loaded.exerciseConfig.improvisationAdvanceMode).toBe('footpedal_release');
    expect(loaded.exerciseConfig.chainMovement).toBe(100);
    expect(loaded.settings.scaleGuideLabelMode).toBe('degrees');
    expect(loaded.settings.enableComputerKeyboardAudio).toBe(true);
    expect(loaded.settings.keyboardFriendlyVoicings).toBe(true);
    expect(loaded.settings.practiceTrackingMode).toBe('test');
    expect(loaded.nodeMastery['ionian:C:Imaj7:shell_137:0:v1'].attempts).toBe(8);
  });

  it('infers a curriculum preset from a saved legacy lane selection', () => {
    window.localStorage.setItem(
      'modal-muscle-memory-progress',
      JSON.stringify({
        exerciseConfig: {
          mode: 'guided',
          lane: 'ionian_aeolian_mixture',
          rhythm: ['all'],
        },
      }),
    );

    const loaded = loadProgressState();

    expect(loaded.exerciseConfig.curriculumPresetId).toBe('mixture_foundations');
    expect(loaded.exerciseConfig.lane).toBe('ionian_aeolian_mixture');
  });

  it('normalizes invalid saved filter ids back to the preset defaults', () => {
    window.localStorage.setItem(
      'modal-muscle-memory-progress',
      JSON.stringify({
        exerciseConfig: {
          mode: 'guided',
          curriculumPresetId: 'major_foundations',
          lane: 'ionian',
          enabledContentBlockIds: ['not_a_block'],
          enabledScaleFamilyIds: ['not_a_scale_family'],
          enabledProgressionFamilyTags: ['not_a_progression_family'],
          keySet: 'not_a_key_set',
          rhythm: ['all'],
        },
      }),
    );

    const loaded = loadProgressState();

    expect(loaded.exerciseConfig.enabledContentBlockIds).toEqual(['major_foundations']);
    expect(loaded.exerciseConfig.enabledScaleFamilyIds).toEqual(['diatonic_modes', 'pentatonic_blues']);
    expect(loaded.exerciseConfig.enabledProgressionFamilyTags).toEqual([
      'scalar',
      'cadence',
      'turnaround',
      'circle_motion',
      'predominant',
    ]);
    expect(loaded.exerciseConfig.keySet).toBe('max_2_accidentals');
  });

  it('preserves intentionally empty filter groups on reload', () => {
    window.localStorage.setItem(
      'modal-muscle-memory-progress',
      JSON.stringify({
        exerciseConfig: {
          mode: 'guided',
          curriculumPresetId: 'major_foundations',
          lane: 'ionian',
          enabledContentBlockIds: [],
          enabledScaleFamilyIds: [],
          enabledProgressionFamilyTags: [],
          keySet: 'max_2_accidentals',
          rhythm: ['all'],
        },
      }),
    );

    const loaded = loadProgressState();

    expect(loaded.exerciseConfig.enabledContentBlockIds).toEqual([]);
    expect(loaded.exerciseConfig.enabledScaleFamilyIds).toEqual([]);
    expect(loaded.exerciseConfig.enabledProgressionFamilyTags).toEqual([]);
  });

  it('normalizes fully selected rhythm specifics back to all', () => {
    window.localStorage.setItem(
      'modal-muscle-memory-progress',
      JSON.stringify({
        exerciseConfig: {
          mode: 'guided',
          curriculumPresetId: 'major_foundations',
          lane: 'ionian',
          rhythm: ['block_whole', 'quarters', 'charleston', 'anticipation_4and', 'offbeat_1and_3', 'syncopated_2and_4'],
        },
      }),
    );

    const loaded = loadProgressState();

    expect(loaded.exerciseConfig.rhythm).toEqual(['all']);
  });

  it('merges adjacent phrase completions into a single practice block', () => {
    const progress = createDefaultProgressState();

    const afterFirst = pushSession(progress, {
      id: 'session-a',
      mode: 'guided',
      curriculumPresetId: 'major_foundations',
      lane: 'ionian',
      startedAt: new Date('2026-03-21T10:00:00.000Z').toISOString(),
      endedAt: new Date('2026-03-21T10:02:00.000Z').toISOString(),
      phraseIds: ['phrase:guided:ionian:targeting_improvement:ionian_scalar_up:C:shell_137:a'],
      accuracy: 0.84,
      medianTransitionLatencyMs: 520,
    });

    const afterSecond = pushSession(afterFirst, {
      id: 'session-b',
      mode: 'guided',
      curriculumPresetId: 'major_foundations',
      lane: 'ionian',
      startedAt: new Date('2026-03-21T10:05:00.000Z').toISOString(),
      endedAt: new Date('2026-03-21T10:08:00.000Z').toISOString(),
      phraseIds: ['phrase:guided:ionian:targeting_improvement:ionian_turnaround:C:shell_137:b'],
      accuracy: 0.94,
      medianTransitionLatencyMs: 430,
    });

    expect(afterSecond.sessionHistory).toHaveLength(1);
    expect(afterSecond.sessionHistory[0].phraseIds).toHaveLength(2);
    expect(afterSecond.sessionHistory[0].startedAt).toBe('2026-03-21T10:00:00.000Z');
    expect(afterSecond.sessionHistory[0].endedAt).toBe('2026-03-21T10:08:00.000Z');
    expect(afterSecond.sessionHistory[0].accuracy).toBeCloseTo(0.89, 5);
  });
});
