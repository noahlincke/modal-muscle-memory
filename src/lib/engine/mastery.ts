import type { EvaluationResult, MasteryStat } from '../../types/music';
import type { ProgressState } from '../../types/progress';

const EWMA_ALPHA = 0.35;

export function createEmptyMasteryStat(nowIso: string): MasteryStat {
  return {
    attempts: 0,
    successes: 0,
    accuracyEwma: 0,
    latencyEwmaMs: 0,
    lastSeenAt: nowIso,
    intervalBucket: 0,
  };
}

function ewma(previous: number, next: number): number {
  if (previous === 0) {
    return next;
  }
  return previous * (1 - EWMA_ALPHA) + next * EWMA_ALPHA;
}

export function edgeMasteryKey(fromTokenId: string, toTokenId: string): string {
  return `${fromTokenId}->${toTokenId}`;
}

export function updateMasteryStat(
  previous: MasteryStat | undefined,
  result: EvaluationResult,
  nowIso: string,
): MasteryStat {
  const current = previous ?? createEmptyMasteryStat(nowIso);

  return {
    attempts: current.attempts + 1,
    successes: current.successes + (result.success ? 1 : 0),
    accuracyEwma: ewma(current.accuracyEwma, result.accuracy),
    latencyEwmaMs: ewma(current.latencyEwmaMs, result.latencyMs),
    lastSeenAt: nowIso,
    intervalBucket: Math.min(8, current.intervalBucket + (result.success ? 1 : -1)),
  };
}

export function applyMasteryUpdate(
  progress: ProgressState,
  tokenId: string,
  result: EvaluationResult,
  nowIso: string,
  fromTokenId: string | null,
): ProgressState {
  const nextNodeMastery = {
    ...progress.nodeMastery,
    [tokenId]: updateMasteryStat(progress.nodeMastery[tokenId], result, nowIso),
  };

  const nextEdgeMastery = { ...progress.edgeMastery };
  if (fromTokenId) {
    const key = edgeMasteryKey(fromTokenId, tokenId);
    nextEdgeMastery[key] = updateMasteryStat(progress.edgeMastery[key], result, nowIso);
  }

  return {
    ...progress,
    nodeMastery: nextNodeMastery,
    edgeMastery: nextEdgeMastery,
  };
}

export function masterySuccessRate(stat: MasteryStat | undefined): number {
  if (!stat || stat.attempts === 0) {
    return 0;
  }
  return stat.successes / stat.attempts;
}
