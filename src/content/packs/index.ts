import type { ModeLane } from '../../types/music';
import { aeolianStarterPack } from './aeolianStarter';
import { ionianStarterPack } from './ionianStarter';
import { mixedStarterPack } from './mixedStarter';
import type { ContentPack } from './types';

export const STARTER_CONTENT_PACKS: ContentPack[] = [
  ionianStarterPack,
  aeolianStarterPack,
  mixedStarterPack,
];

export const PACKS_BY_LANE: Record<ModeLane, ContentPack | null> = {
  ionian: ionianStarterPack,
  aeolian: aeolianStarterPack,
  ionian_aeolian_mixture: mixedStarterPack,
  dorian: null,
  mixolydian: null,
  lydian: null,
  phrygian: null,
};

export function getPackForLane(lane: ModeLane): ContentPack | null {
  return PACKS_BY_LANE[lane];
}

export function getAllPackIds(): string[] {
  return STARTER_CONTENT_PACKS.map((pack) => pack.id);
}
