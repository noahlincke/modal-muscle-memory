import type { ModeLane, VoicingFamily } from '../../types/music';
import type { ProgressState, UnlockDecision, UnlockState } from '../../types/progress';
import { median } from '../theory/noteUtils';

const ROOT_UNLOCK_ORDER = ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'Gb'];
const VOICING_UNLOCK_ORDER: VoicingFamily[] = ['shell_137', 'closed_7th', 'inversion_1'];

const VOICING_LATENCY_TARGET_MS: Record<VoicingFamily, number> = {
  shell_137: 900,
  shell_173: 900,
  closed_7th: 1100,
  inversion_1: 1300,
  inversion_2: 1300,
  triad_root: 900,
  six_nine: 1300,
  ninth: 1300,
  slash: 1300,
  rootless: 1500,
};

function laneAttempts(progress: ProgressState, lane: ModeLane) {
  return progress.recentAttempts.filter((attempt) => attempt.lane === lane).slice(-20);
}

function deckLatencyTargetMs(unlock: UnlockState): number {
  const maxTarget = unlock.voicings.reduce((current, voicing) => {
    const target = VOICING_LATENCY_TARGET_MS[voicing] ?? 1100;
    return Math.max(current, target);
  }, 900);

  const rhythmTolerance = unlock.rhythms.some((rhythm) => rhythm !== 'block_whole' && rhythm !== 'quarters')
    ? 200
    : 0;

  return maxTarget + rhythmTolerance;
}

function foundationalNodeFloor(progress: ProgressState, lane: ModeLane): number {
  const stats = Object.entries(progress.nodeMastery)
    .filter(([tokenId, stat]) => tokenId.startsWith(`${lane}:`) && stat.attempts >= 3)
    .map(([, stat]) => stat.accuracyEwma);

  if (stats.length === 0) {
    return 1;
  }

  return Math.min(...stats);
}

function nextRootToUnlock(unlock: UnlockState): string | null {
  for (const root of ROOT_UNLOCK_ORDER) {
    if (!unlock.roots.includes(root)) {
      return root;
    }
  }
  return null;
}

function nextVoicingToUnlock(unlock: UnlockState): VoicingFamily | null {
  for (const voicing of VOICING_UNLOCK_ORDER) {
    if (!unlock.voicings.includes(voicing)) {
      return voicing;
    }
  }
  return null;
}

export function shouldUnlock(progress: ProgressState, lane: ModeLane): boolean {
  const attempts = laneAttempts(progress, lane);
  if (attempts.length < 20) {
    return false;
  }

  const accuracy = attempts.reduce((sum, attempt) => sum + attempt.accuracy, 0) / attempts.length;
  const medianLatency = median(attempts.map((attempt) => attempt.latencyMs));
  const unlock = progress.unlocksByLane[lane];
  const latencyTarget = deckLatencyTargetMs(unlock);
  const floor = foundationalNodeFloor(progress, lane);

  return accuracy >= 0.92 && medianLatency <= latencyTarget && floor >= 0.8;
}

export function applyUnlockDecision(
  progress: ProgressState,
  lane: ModeLane,
): { progress: ProgressState; decision: UnlockDecision } {
  if (!shouldUnlock(progress, lane)) {
    return {
      progress,
      decision: {
        unlocked: false,
        axis: null,
        value: null,
        reason: 'Current deck below unlock threshold.',
      },
    };
  }

  const laneUnlock = progress.unlocksByLane[lane];
  const nextRoot = nextRootToUnlock(laneUnlock);
  if (nextRoot) {
    return {
      progress: {
        ...progress,
        unlocksByLane: {
          ...progress.unlocksByLane,
          [lane]: {
            ...laneUnlock,
            roots: [...laneUnlock.roots, nextRoot],
          },
        },
      },
      decision: {
        unlocked: true,
        axis: 'root',
        value: nextRoot,
        reason: 'Deck fluent: unlocked next tonal center.',
      },
    };
  }

  const nextVoicing = nextVoicingToUnlock(laneUnlock);
  if (nextVoicing) {
    return {
      progress: {
        ...progress,
        unlocksByLane: {
          ...progress.unlocksByLane,
          [lane]: {
            ...laneUnlock,
            voicings: [...laneUnlock.voicings, nextVoicing],
          },
        },
      },
      decision: {
        unlocked: true,
        axis: 'voicing',
        value: nextVoicing,
        reason: 'Deck fluent: unlocked next voicing family.',
      },
    };
  }

  if (lane === 'ionian_aeolian_mixture' && laneUnlock.borrowedDepth < 2) {
    const nextDepth = laneUnlock.borrowedDepth + 1;
    return {
      progress: {
        ...progress,
        unlocksByLane: {
          ...progress.unlocksByLane,
          [lane]: {
            ...laneUnlock,
            borrowedDepth: nextDepth,
          },
        },
      },
      decision: {
        unlocked: true,
        axis: 'borrowed',
        value: String(nextDepth),
        reason: 'Deck fluent: unlocked borrowed-chord depth.',
      },
    };
  }

  return {
    progress,
    decision: {
      unlocked: false,
      axis: null,
      value: null,
      reason: 'Deck fluent but no new starter unlocks remain.',
    },
  };
}
