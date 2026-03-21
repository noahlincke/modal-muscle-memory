import type { ModeLane, ProgressionDefinition, RhythmCellId, VoicingFamily } from '../../types/music';

export interface ContentPack {
  id: string;
  version: number;
  lane: ModeLane;
  roots: string[];
  voicings: VoicingFamily[];
  rhythms: RhythmCellId[];
  progressions: ProgressionDefinition[];
}
