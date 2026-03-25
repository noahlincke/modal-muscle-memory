import type { CircleVisualizationMode, ImprovisationAdvanceMode } from './music';
import type {
  ContentBlockId,
  CurriculumPresetId,
  ExerciseMode,
  GuidedFlowMode,
  ImprovisationProgressionMode,
  KeySetId,
  MasteryStat,
  ModeLane,
  PhraseFocusType,
  ProgressionFamilyTag,
  RhythmCellId,
  RhythmSelection,
  ScoringMode,
  ScaleFamilyId,
  VoicingPracticeMode,
  VoicingFamily,
} from './music';

export interface ExerciseConfig {
  mode: ExerciseMode;
  curriculumPresetId: CurriculumPresetId;
  lane: ModeLane;
  enabledContentBlockIds: ContentBlockId[];
  enabledScaleFamilyIds: ScaleFamilyId[];
  enabledProgressionFamilyTags: ProgressionFamilyTag[];
  keySet: KeySetId;
  rhythm: RhythmSelection;
  voicingPracticeMode: VoicingPracticeMode;
  selectedVoicings: VoicingFamily[];
  guidedFlowMode: GuidedFlowMode;
  improvisationProgressionMode: ImprovisationProgressionMode;
  improvisationAdvanceMode: ImprovisationAdvanceMode;
  chainMovement: number;
}

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
  mode: ExerciseMode;
  curriculumPresetId: CurriculumPresetId;
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
  practiceTrackingMode: 'test' | 'play';
  scaleGuideLabelMode: 'degrees' | 'note_names';
  staffClef: 'treble' | 'bass';
  registerMin: number;
  registerMax: number;
  scoringMode: ScoringMode;
  midiInputId: string | null;
  enableReferencePlayback: boolean;
  enableComputerKeyboardAudio: boolean;
  keyboardFriendlyVoicings: boolean;
  circleVisualizationMode: CircleVisualizationMode;
  immersiveMode: boolean;
}

export interface ProgressState {
  schemaVersion: number;
  exerciseConfig: ExerciseConfig;
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
