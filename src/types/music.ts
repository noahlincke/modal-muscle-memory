export type ModeLane =
  | 'ionian'
  | 'aeolian'
  | 'ionian_aeolian_mixture'
  | 'dorian'
  | 'mixolydian'
  | 'lydian'
  | 'phrygian';

export type CurriculumPresetId =
  | 'major_foundations'
  | 'minor_foundations'
  | 'mixture_foundations'
  | 'modal_colors'
  | 'functional_minor_extensions'
  | 'dominant_and_symmetric'
  | 'full_library';

export type ContentBlockId =
  | 'major_foundations'
  | 'minor_foundations'
  | 'borrowed_color'
  | 'modal_colors'
  | 'dominant_color'
  | 'functional_minor_extensions'
  | 'symmetric_color';

export type ExerciseMode = 'guided' | 'improvisation';
export type GuidedFlowMode = 'random' | 'targeting_improvement' | 'musical_chaining';
export type ImprovisationProgressionMode = 'random' | 'targeting_improvement' | 'chained';
export type ImprovisationAdvanceMode = 'immediate' | 'footpedal_release';
export type CircleVisualizationMode = 'intervals' | 'chord_arrows';

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
  | 'halves'
  | 'quarters'
  | 'charleston'
  | 'tresillo_332'
  | 'backbeat_2_4'
  | 'push_2and_hold'
  | 'anticipation_4and'
  | 'push_4and_hold'
  | 'hold_from_3'
  | 'offbeat_1and_3'
  | 'syncopated_2and_4'
  | 'late_pickup_4'
  | 'floating_2and';

export type RhythmFilterId = RhythmCellId | 'all';
export type RhythmSelection = RhythmFilterId[];
export type BassPolicy = 'exact' | 'allow_inversion' | 'any_allowed';
export type TopNotePolicy = 'exact' | 'preferred' | 'any_allowed';

export type KeySetId =
  | 'c_only'
  | 'max_1_accidental'
  | 'max_2_accidentals'
  | 'max_3_accidentals'
  | 'max_4_accidentals'
  | 'max_5_accidentals'
  | 'all_keys';

export type ScaleFamilyId =
  | 'diatonic_modes'
  | 'pentatonic_blues'
  | 'harmonic_minor_family'
  | 'melodic_minor_family'
  | 'dominant_altered_family'
  | 'symmetric_family';

export type ScaleId =
  | 'ionian'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'aeolian'
  | 'locrian'
  | 'major_pentatonic'
  | 'minor_pentatonic'
  | 'major_blues'
  | 'minor_blues'
  | 'harmonic_minor'
  | 'phrygian_dominant'
  | 'melodic_minor'
  | 'dorian_b2'
  | 'lydian_augmented'
  | 'lydian_dominant'
  | 'mixolydian_b6'
  | 'locrian_natural_2'
  | 'altered'
  | 'whole_tone'
  | 'half_whole_diminished'
  | 'whole_half_diminished';

export type ScaleCategory = 'mode' | 'pentatonic' | 'blues' | 'minor_system' | 'dominant_color' | 'symmetric';
export type StyleTag = 'functional_jazz' | 'modal_jazz' | 'borrowed_color' | 'contemporary_modal';
export type ProgressionFamilyTag =
  | 'scalar'
  | 'turnaround'
  | 'predominant'
  | 'circle_motion'
  | 'cadence'
  | 'minor_loop'
  | 'borrowed'
  | 'backdoor'
  | 'modal_vamp'
  | 'secondary_dominant'
  | 'dominant_cycle'
  | 'symmetric_color';

export type HarmonicFunctionTag = 'tonic' | 'predominant' | 'dominant' | 'color' | 'passing';

export interface ScaleOption {
  id: ScaleId;
  label: string;
  category: ScaleCategory;
  familyId: ScaleFamilyId;
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
  spelledVoicing: string[];
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
