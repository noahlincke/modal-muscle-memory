export type ModeLane =
  | 'ionian'
  | 'aeolian'
  | 'ionian_aeolian_mixture'
  | 'dorian'
  | 'mixolydian'
  | 'lydian'
  | 'phrygian';

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

export type BassPolicy = 'exact' | 'allow_inversion' | 'any_allowed';
export type TopNotePolicy = 'exact' | 'preferred' | 'any_allowed';

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
  bar: number;
  beat: number;
  durationBeats: number;
  rhythmCellId: RhythmCellId;
}

export interface PhraseTemplate {
  id: string;
  lane: ModeLane;
  difficulty: number;
  romanPlan: string[];
  allowedVoicings: VoicingFamily[];
  rhythmPlan: RhythmCellId[];
  maxVoiceMotionSemitones: number;
  tonicCenterStable: boolean;
}

export interface Phrase {
  id: string;
  lane: ModeLane;
  tonic: string;
  tempo: number;
  timeSignature: '4/4';
  events: PhraseEvent[];
  tokensById: Record<string, ChordToken>;
  templateId: string;
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
    | 'missing_required_tone'
    | 'wrong_bass'
    | 'wrong_inversion'
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
