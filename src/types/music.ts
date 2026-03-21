export type ModeLane =
  | 'ionian'
  | 'aeolian'
  | 'ionian_aeolian_mixture'
  | 'dorian'
  | 'mixolydian'
  | 'lydian'
  | 'phrygian';

export type ExerciseMode = 'guided' | 'improvisation';

export type VoicingFamily =
  | 'triad_root'
  | 'shell_137'
  | 'shell_173'
  | 'closed_7th'
  | 'inversion_1'
  | 'inversion_2'
  | 'six_nine'
  | 'ninth'
  | 'slash'
  | 'rootless';

export type RhythmCellId =
  | 'block_whole'
  | 'quarters'
  | 'charleston'
  | 'anticipation_4and'
  | 'offbeat_1and_3'
  | 'syncopated_2and_4';

export type RhythmSelection = RhythmCellId | 'all';
export type BassPolicy = 'exact' | 'allow_inversion' | 'any_allowed';
export type TopNotePolicy = 'exact' | 'preferred' | 'any_allowed';

export type ScaleId =
  | 'ionian'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'aeolian'
  | 'locrian'
  | 'major_pentatonic'
  | 'minor_pentatonic';

export type ScaleCategory = 'mode' | 'pentatonic';
export type StyleTag = 'functional_jazz' | 'modal_jazz' | 'borrowed_color' | 'contemporary_modal';
export type ProgressionFamilyTag =
  | 'scalar'
  | 'turnaround'
  | 'predominant'
  | 'circle_motion'
  | 'cadence'
  | 'minor_loop'
  | 'borrowed'
  | 'backdoor';

export type HarmonicFunctionTag = 'tonic' | 'predominant' | 'dominant' | 'color' | 'passing';

export interface ScaleOption {
  id: ScaleId;
  label: string;
  category: ScaleCategory;
  intervalFormula: string[];
  qualityTags: string[];
}

export interface ProgressionStep {
  roman: string;
  functionTag: HarmonicFunctionTag;
  recommendedScaleIds: ScaleId[];
  colorScaleIds: ScaleId[];
}

export interface ProgressionDifficultyProfile {
  level: number;
  accidentalComplexity: number;
  borrowedChordCount: number;
  alterationComplexity: number;
}

export interface ProgressionTags {
  styles: StyleTag[];
  modeFamilies: ModeLane[];
  families: ProgressionFamilyTag[];
}

export interface ProgressionDefinition {
  id: string;
  lane: ModeLane;
  difficulty: number;
  steps: ProgressionStep[];
  allowedVoicings: VoicingFamily[];
  rhythmPlan: RhythmCellId[];
  maxVoiceMotionSemitones: number;
  tonicCenterStable: boolean;
  tags: ProgressionTags;
  difficultyProfile: ProgressionDifficultyProfile;
  chainTargets: string[];
}

export interface ChordToken {
  id: string;
  tonic: string;
  lane: ModeLane;
  roman: string;
  symbol: string;
  quality: string;
  pitchClasses: string[];
  requiredPitchClasses: string[];
  optionalPitchClasses: string[];
  voicingFamily: VoicingFamily;
  inversion: number | null;
  bassPolicy: BassPolicy;
  topNotePolicy: TopNotePolicy;
  midiRange: { min: number; max: number };
  midiVoicing: number[];
}

export interface PhraseEvent {
  id: string;
  chordTokenId: string;
  progressionStepIndex: number;
  bar: number;
  beat: number;
  durationBeats: number;
  rhythmCellId: RhythmCellId;
}

export interface Phrase {
  id: string;
  lane: ModeLane;
  tonic: string;
  tempo: number;
  timeSignature: '4/4';
  events: PhraseEvent[];
  tokensById: Record<string, ChordToken>;
  progressionId: string;
  progression: ProgressionDefinition;
  focusType: PhraseFocusType;
}

export interface MasteryStat {
  attempts: number;
  successes: number;
  accuracyEwma: number;
  latencyEwmaMs: number;
  lastSeenAt: string;
  intervalBucket: number;
}

export interface TransitionKey {
  fromTokenId: string;
  toTokenId: string;
}

export type ScoringMode = 'lenient' | 'standard' | 'strict';

export type PhraseFocusType =
  | 'weak_transition'
  | 'weak_node'
  | 'due_review'
  | 'new_item';

export interface ScoringError {
  code:
    | 'wrong_pitch_class'
    | 'wrong_target_notes'
    | 'missing_required_tone'
    | 'wrong_bass'
    | 'wrong_inversion'
    | 'outside_allowed_scale'
    | 'early'
    | 'late'
    | 'carried_over_notes';
  message: string;
}

export interface EvaluationResult {
  success: boolean;
  timingDeltaMs: number;
  timingBucket: 'early' | 'on_time' | 'late';
  accuracy: number;
  latencyMs: number;
  matchedRequired: number;
  errors: ScoringError[];
}

export interface EventAttemptInput {
  targetToken: ChordToken;
  playedNotes: number[];
  expectedTimeMs: number;
  submittedAtMs: number;
  scoringMode: ScoringMode;
  previousEventEndNotes?: number[];
  tolerances?: {
    earlyMs: number;
    lateMs: number;
  };
}
