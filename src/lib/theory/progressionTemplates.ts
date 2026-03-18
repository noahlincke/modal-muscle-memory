import { getPackForLane } from '../../content/packs';
import type { ModeLane, PhraseTemplate } from '../../types/music';

export function getTemplatesForLane(lane: ModeLane): PhraseTemplate[] {
  const pack = getPackForLane(lane);
  return pack?.templates ?? [];
}

export function countTemplatesByLane(lane: ModeLane): number {
  return getTemplatesForLane(lane).length;
}
