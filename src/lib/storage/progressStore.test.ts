import { describe, expect, it } from 'vitest';
import {
  createDefaultProgressState,
  loadProgressState,
  saveProgressState,
} from './progressStore';

describe('progressStore', () => {
  it('persists and reloads progress', () => {
    const progress = createDefaultProgressState();
    progress.exerciseConfig.lane = 'aeolian';
    progress.exerciseConfig.mode = 'improvisation';
    progress.exerciseConfig.improvisationProgressionMode = 'chained';
    progress.exerciseConfig.chainMovement = 72;
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
    expect(loaded.exerciseConfig.improvisationProgressionMode).toBe('chained');
    expect(loaded.exerciseConfig.chainMovement).toBe(72);
    expect(loaded.settings.scaleGuideLabelMode).toBe('degrees');
    expect(loaded.nodeMastery['ionian:C:Imaj7:shell_137:0:v1']).toBeDefined();
  });

  it('merges unlock defaults and keeps existing mastery data', () => {
    window.localStorage.setItem(
      'modal-muscle-memory-progress',
      JSON.stringify({
        exerciseConfig: {
          mode: 'guided',
          lane: 'ionian',
          rhythm: 'all',
          improvisationProgressionMode: 'chained',
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
    expect(loaded.exerciseConfig.improvisationProgressionMode).toBe('chained');
    expect(loaded.exerciseConfig.chainMovement).toBe(100);
    expect(loaded.settings.scaleGuideLabelMode).toBe('degrees');
    expect(loaded.nodeMastery['ionian:C:Imaj7:shell_137:0:v1'].attempts).toBe(8);
  });
});
