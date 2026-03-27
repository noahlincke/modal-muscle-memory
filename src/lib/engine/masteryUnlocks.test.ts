import { describe, expect, it } from 'vitest';
import { applyMasteryUpdate } from './mastery';
import { applyUnlockDecision } from './unlocks';
import { createDefaultProgressState, pushAttempt } from '../storage/progressStore';

describe('mastery + unlocks', () => {
  it('updates node and edge mastery together', () => {
    const now = new Date().toISOString();
    let progress = createDefaultProgressState();

    progress = applyMasteryUpdate(
      progress,
      'ionian:C:Imaj7:shell_137:0:v1',
      {
        success: true,
        timingDeltaMs: 12,
        timingBucket: 'on_time',
        accuracy: 0.98,
        latencyMs: 120,
        matchedRequired: 3,
        errors: [],
      },
      now,
      'ionian:C:ii7:shell_137:0:v1',
    );

    const node = progress.nodeMastery['ionian:C:Imaj7:shell_137:0:v1'];
    const edge = progress.edgeMastery['ionian:C:ii7:shell_137:0:v1->ionian:C:Imaj7:shell_137:0:v1'];

    expect(node).toBeDefined();
    expect(edge).toBeDefined();
    expect(node.attempts).toBe(1);
    expect(edge.attempts).toBe(1);
  });

  it('unlocks exactly one axis step when deck is fluent', () => {
    let progress = createDefaultProgressState();

    for (let i = 0; i < 20; i += 1) {
      progress = pushAttempt(progress, {
        id: `a${i}`,
        at: new Date(Date.now() - i * 1000).toISOString(),
        lane: 'ionian',
        tokenId: 'ionian:C:Imaj7:shell_137:0:v1',
        transitionFromTokenId: i === 0 ? null : 'ionian:C:ii7:shell_137:0:v1',
        success: true,
        accuracy: 0.97,
        latencyMs: 620,
        focusType: 'weak_node',
      });
    }

    const { progress: unlocked, decision } = applyUnlockDecision(progress, 'ionian');

    expect(decision.unlocked).toBe(true);
    expect(decision.axis).toBe('root');

    const roots = unlocked.unlocksByLane.ionian.roots;
    expect(roots.length).toBe(progress.unlocksByLane.ionian.roots.length + 1);
    expect(unlocked.unlocksByLane.ionian.voicings.length).toBe(progress.unlocksByLane.ionian.voicings.length);
  });
});
