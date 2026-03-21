import { getPackForLane } from '../../content/packs';
import type { ModeLane, ProgressionDefinition } from '../../types/music';

export function getProgressionsForLane(lane: ModeLane): ProgressionDefinition[] {
  const pack = getPackForLane(lane);
  return pack?.progressions ?? [];
}

export function countProgressionsByLane(lane: ModeLane): number {
  return getProgressionsForLane(lane).length;
}
