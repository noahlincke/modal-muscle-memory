import type {
  MasteryStat,
  ModeLane,
  PhraseFocusType,
  RhythmCellId,
  ScoringMode,
  VoicingFamily,
} from './music';

export interface UnlockState {
  roots: string[];
  modes: ModeLane[];
  voicings: VoicingFamily[];
  rhythms: RhythmCellId[];
  borrowedDepth: number;
  unlockedPackIds: string[];
}

export interface AttemptRecord {
  id: string;
  at: string;
  lane: ModeLane;
  tokenId: string;
  transitionFromTokenId: string | null;
  success: boolean;
  accuracy: number;
  latencyMs: number;
  focusType: PhraseFocusType;
}

export interface SessionRecord {
  id: string;
  lane: ModeLane;
  startedAt: string;
  endedAt: string;
  phraseIds: string[];
  accuracy: number;
  medianTransitionLatencyMs: number;
}

export interface UserSettings {
  tempo: number;
  metronomeEnabled: boolean;
  showKeyboardPanel: boolean;
  staffClef: 'treble' | 'bass';
  registerMin: number;
  registerMax: number;
  scoringMode: ScoringMode;
  midiInputId: string | null;
  enableReferencePlayback: boolean;
}

export interface ProgressState {
  schemaVersion: number;
  selectedLane: ModeLane;
  settings: UserSettings;
  unlocksByLane: Record<ModeLane, UnlockState>;
  nodeMastery: Record<string, MasteryStat>;
  edgeMastery: Record<string, MasteryStat>;
  recentAttempts: AttemptRecord[];
  sessionHistory: SessionRecord[];
  lastSessionAt: string | null;
}

export interface UnlockDecision {
  unlocked: boolean;
  axis: 'root' | 'voicing' | 'borrowed' | null;
  value: string | null;
  reason: string;
}
