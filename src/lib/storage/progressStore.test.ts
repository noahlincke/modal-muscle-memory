import { describe, expect, it } from 'vitest';
import {
  createDefaultProgressState,
  loadProgressState,
  saveProgressState,
} from './progressStore';

describe('progressStore', () => {
  it('persists and reloads progress', () => {
    const progress = createDefaultProgressState();
    progress.selectedLane = 'aeolian';
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

    expect(loaded.selectedLane).toBe('aeolian');
    expect(loaded.nodeMastery['ionian:C:Imaj7:shell_137:0:v1']).toBeDefined();
  });

  it('merges unlock defaults and keeps existing mastery data', () => {
    window.localStorage.setItem(
      'modal-muscle-memory-progress',
      JSON.stringify({
        selectedLane: 'ionian',
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
    expect(loaded.nodeMastery['ionian:C:Imaj7:shell_137:0:v1'].attempts).toBe(8);
  });
});
