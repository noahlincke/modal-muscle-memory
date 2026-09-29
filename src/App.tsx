import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  applyCurriculumPreset,
  CONTENT_BLOCKS,
  CURRICULUM_PRESETS,
  deriveScaleModeScaleIdsForContentBlocks,
  deriveFamiliesForContentBlocks,
  getCurriculumPreset,
  KEY_SET_OPTIONS,
  SCALE_FAMILY_OPTIONS,
} from './content/curriculum';
import {
  normalizeIncludedKeyRoots,
  nextRootOnCircle,
  resolveIncludedKeyRootsForLane,
  resolveIncludedKeyRootsForScale,
  rootsForKeySet,
} from './content/keys';
import { getScaleOption } from './content/scales';
import { PracticeLayout } from './components/PracticeLayout';
import { PracticeSettingsDrawer } from './components/PracticeSettingsDrawer';
import { ProgressScreen } from './components/ProgressScreen';
import type { WalkthroughStep } from './components/WalkthroughBubble';
import { createMicFallbackState, microphonePermissionGranted, MicAccessController, type MicConnectionState } from './lib/audio/micAccess';
import { Metronome } from './lib/audio/metronome';
import type { PitchObservation } from './lib/audio/pitchDetection';
import { PreviewPlayback } from './lib/audio/previewPlayback';
import {
  evaluateAttempt,
  evaluateFlashcardAttempt,
  evaluateMicAttempt,
  evaluateMicFlashcardAttempt,
} from './lib/engine/evaluator';
import {
  evaluateImprovisationAttempt,
  evaluateMicImprovisationAttempt,
} from './lib/engine/improvisationEvaluator';
import {
  activeVoicingFamiliesForPractice,
  availableVoicingFamiliesForConfig,
  countMatchingProgressions,
  countPotentialProgressions,
  generatePhrase,
  listPotentialPhraseVariants,
  playableProgressionIds,
} from './lib/engine/phraseGenerator';
import { generateScalePrompt, listPlayableScaleTargets } from './lib/engine/scalePromptGenerator';
import { applyMasteryUpdate } from './lib/engine/mastery';
import { applyUnlockDecision } from './lib/engine/unlocks';
import { createMidiFallbackState, MidiAccessController, type MidiConnectionState } from './lib/midi/midiAccess';
import { ChordCapture } from './lib/midi/chordCapture';
import { carryoverNotesAfterAdvance, hasAcceptedNotesStillHeld } from './lib/midi/chordAdvance';
import type { ParsedMidiMessage } from './lib/midi/midiParser';
import { ScaleCapture } from './lib/midi/scaleCapture';
import {
  createSyntheticNoteMessage,
  defaultQwertyOctaveShiftForClef,
  isTextInputTarget,
  noteNumberForBinding,
  octaveShiftForAction,
  qwertyBindingForKey,
  qwertyControlActionForKey,
  qwertyFriendlyRangeForOctaveShift,
} from './lib/input/qwertyInput';
import { MicCapture, type MicCaptureDebugEvent } from './lib/input/micCapture';
import { filterMicOverlapPitchClasses } from './lib/input/micOverlap';
import { loadRemoteProgress, saveRemoteProgress } from './lib/auth/progressSync';
import { getSupabaseClient, isSupabaseConfigured } from './lib/auth/supabaseClient';
import { buildProgressionMasterySummaries, MASTERY_MIN_ATTEMPTS } from './lib/progressionMastery';
import { createDefaultProgressState, loadProgressState, normalizeProgressState, pushAttempt, pushSession, saveProgressState } from './lib/storage/progressStore';
import { median, midiToPitchClass } from './lib/theory/noteUtils';
import { preferredCenterForClef, registerForClef } from './lib/theory/voicingPlacement';
import { buildChordToken } from './lib/theory/chordToken';
import { orderedVoicingFamilies } from './lib/voicingFamilies';
import {
  degreeLabelsForScale,
  intersectPitchClasses,
  pitchClassesForScale,
  pitchClassesForScaleIds,
} from './lib/theory/scaleMap';
import { progressionSubtitle } from './lib/progressionLabels';
import { resolveRomanToChord } from './lib/theory/roman';
import type { EvaluationResult, Phrase, PhraseEvent, ScaleId, ScalePrompt, VoicingFamily } from './types/music';
import type { AttemptRecord, InputMode, ProgressState } from './types/progress';

type Screen = 'practice' | 'progress';
type ThemeMode = 'light' | 'dark' | 'focus';
const FOOTPEDAL_RELEASE_WINDOW_MS = 650;
const THEME_STORAGE_KEY = 'modal-muscle-memory-theme';
const WALKTHROUGH_STORAGE_KEY = 'modal-muscle-memory-walkthrough-seen';
const WALKTHROUGH_DEBUG_PARAM = 'walkthrough';
const MIC_DEBUG_QUERY_PARAM = 'micdebug';
const MIC_DEBUG_STORAGE_KEY = 'modal-muscle-memory-mic-debug';
const WALKTHROUGH_STEPS: WalkthroughStep[] = ['exercise', 'key', 'content', 'settings'];
const ALL_CONTENT_BLOCK_IDS = CONTENT_BLOCKS.map((block) => block.id);
const NON_FULL_LIBRARY_PRESETS = CURRICULUM_PRESETS.filter((preset) => preset.id !== 'full_library');
const MIC_OVERLAP_GRACE_MS = 260;

interface ExercisePickerItem {
  id: string;
  label: string;
  subtitle: string;
  masteryLabel: string;
  detailLabel: string;
  mastered: boolean;
}

function exactCurriculumPresetIdForContentBlocks(
  enabledContentBlockIds: ProgressState['exerciseConfig']['enabledContentBlockIds'],
): ProgressState['exerciseConfig']['curriculumPresetId'] | null {
  const normalized = [...enabledContentBlockIds].sort();
  const matchedPreset = CURRICULUM_PRESETS.find((preset) => {
    const presetBlockIds = [...preset.enabledContentBlockIds].sort();
    return presetBlockIds.length === normalized.length
      && presetBlockIds.every((blockId, index) => blockId === normalized[index]);
  });

  return matchedPreset?.id ?? null;
}

function toggleCurriculumPresetContentBlocks(
  config: ProgressState['exerciseConfig'],
  presetId: ProgressState['exerciseConfig']['curriculumPresetId'],
): ProgressState['exerciseConfig']['enabledContentBlockIds'] {
  if (presetId === 'full_library') {
    return [...ALL_CONTENT_BLOCK_IDS];
  }

  const preset = getCurriculumPreset(presetId);
  if (!preset) {
    return [...config.enabledContentBlockIds];
  }

  const fullLibrarySelected = config.enabledContentBlockIds.length === ALL_CONTENT_BLOCK_IDS.length
    && ALL_CONTENT_BLOCK_IDS.every((blockId) => config.enabledContentBlockIds.includes(blockId));
  const presetSelected = !fullLibrarySelected
    && preset.enabledContentBlockIds.every((blockId) => config.enabledContentBlockIds.includes(blockId));

  const nextIds = fullLibrarySelected
    ? [...preset.enabledContentBlockIds]
    : (presetSelected
      ? config.enabledContentBlockIds.filter((blockId) => !preset.enabledContentBlockIds.includes(blockId))
      : [...new Set([...config.enabledContentBlockIds, ...preset.enabledContentBlockIds])]);

  if (nextIds.length === 0) {
    return [...config.enabledContentBlockIds];
  }

  const allNonFullPresetsCovered = NON_FULL_LIBRARY_PRESETS.every((candidate) => (
    candidate.enabledContentBlockIds.every((blockId) => nextIds.includes(blockId))
  ));

  return allNonFullPresetsCovered ? [...ALL_CONTENT_BLOCK_IDS] : nextIds;
}

function loadInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'focus') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function nextTheme(theme: ThemeMode): ThemeMode {
  if (theme === 'light') {
    return 'dark';
  }
  if (theme === 'dark') {
    return 'focus';
  }
  return 'light';
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatIncludedKeysLabel(roots: string[]): string {
  return roots.length > 0 ? roots.join(', ') : 'None selected.';
}

function authRedirectUrl(): string {
  if (typeof window === 'undefined') {
    return import.meta.env.BASE_URL;
  }

  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

function walkthroughDebugEnabled(): boolean {
  if (typeof window === 'undefined' || !import.meta.env.DEV) {
    return false;
  }

  const value = new URLSearchParams(window.location.search).get(WALKTHROUGH_DEBUG_PARAM);
  return truthyDebugValue(value);
}

function truthyDebugValue(value: string | null): boolean {
  if (value === null) {
    return false;
  }

  return value === '1' || value === 'true' || value === 'debug';
}

function micDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const searchValue = new URLSearchParams(window.location.search).get(MIC_DEBUG_QUERY_PARAM);
  if (truthyDebugValue(searchValue)) {
    return true;
  }

  return truthyDebugValue(window.localStorage.getItem(MIC_DEBUG_STORAGE_KEY));
}

function loadInitialWalkthroughStep(): WalkthroughStep | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (walkthroughDebugEnabled()) {
    return WALKTHROUGH_STEPS[0];
  }

  return window.localStorage.getItem(WALKTHROUGH_STORAGE_KEY) === 'done'
    ? null
    : WALKTHROUGH_STEPS[0];
}

interface PendingChordAdvance {
  nextIndex: number | null;
  acceptedNotes: number[];
  submittedAtMs: number;
  completedPhrase?: Phrase;
  requiresSustainRelease?: boolean;
  eventId?: string;
  tokenId?: string;
  transitionFromTokenId?: string | null;
  pendingResult?: EvaluationResult;
  pendingAttemptRecord?: AttemptRecord;
}

interface AttemptSubmissionOptions {
  inputSource?: InputMode;
  detectedPitchClasses?: string[];
}

interface MicOverlapState {
  pitchClasses: string[];
  expiresAt: number;
}

interface ImprovisationOverlayContext {
  chordTonePitchClasses: string[];
  currentScalePitchClasses: string[];
  currentScaleDegreeLabels: Record<string, string>;
  currentScaleNoteLabels: Record<string, string>;
  nextScalePitchClasses: string[];
  nextScaleDegreeLabels: Record<string, string>;
  nextScaleNoteLabels: Record<string, string>;
  sharedScalePitchClasses: string[];
  allowedPitchClasses: string[];
}

interface SelectionLocks {
  exercise: boolean;
  key: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeAttemptId(): string {
  return `attempt:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function makeSessionId(): string {
  return `session:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTempo(input: number): number {
  if (!Number.isFinite(input)) {
    return 78;
  }
  const rounded = Math.round(input);
  return Math.min(220, Math.max(40, rounded));
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function activeMicOverlapPitchClasses(
  overlap: MicOverlapState,
  now: number,
): string[] {
  return overlap.expiresAt > now ? overlap.pitchClasses : [];
}

function nextMicOverlapState(
  pitchClasses: string[],
  submittedAtMs: number,
): MicOverlapState {
  return {
    pitchClasses,
    expiresAt: submittedAtMs + MIC_OVERLAP_GRACE_MS,
  };
}

function cycleIndex(length: number, currentIndex: number, direction: 'forward' | 'backward'): number {
  if (length <= 0) {
    return -1;
  }

  const offset = direction === 'forward' ? 1 : -1;
  const baseIndex = currentIndex >= 0 ? currentIndex : 0;
  return (baseIndex + offset + length) % length;
}

const DISPLAY_NOTE_LABELS: Record<string, string> = {
  C: 'C',
  'C#': 'Db',
  D: 'D',
  'D#': 'Eb',
  E: 'E',
  F: 'F',
  'F#': 'Gb',
  G: 'G',
  'G#': 'Ab',
  A: 'A',
  'A#': 'Bb',
  B: 'B',
};

const SPECIFIC_RHYTHM_IDS = [
  'block_whole',
  'halves',
  'quarters',
  'charleston',
  'tresillo_332',
  'backbeat_2_4',
  'push_2and_hold',
  'anticipation_4and',
  'push_4and_hold',
  'hold_from_3',
  'offbeat_1and_3',
  'syncopated_2and_4',
  'late_pickup_4',
  'floating_2and',
] as const;
const FLASHCARD_DEFAULT_VOICINGS: VoicingFamily[] = ['closed_7th', 'inversion_1', 'inversion_2'];

function normalizeVoicingSelection(
  exerciseConfig: ProgressState['exerciseConfig'],
  resetToAvailable: boolean,
): ProgressState['exerciseConfig'] {
  const availableVoicings = availableVoicingFamiliesForConfig(exerciseConfig);
  const flashcardDefaults = orderedVoicingFamilies(
    FLASHCARD_DEFAULT_VOICINGS.filter((voicing) => availableVoicings.includes(voicing)),
  );
  const preferredSelection = exerciseConfig.mode === 'chord_flashcards' && flashcardDefaults.length > 0
    ? flashcardDefaults
    : availableVoicings;
  const nextSelected = orderedVoicingFamilies(
    (resetToAvailable ? preferredSelection : exerciseConfig.selectedVoicings)
      .filter((voicing) => availableVoicings.includes(voicing)),
  );

  return {
    ...exerciseConfig,
    selectedVoicings: nextSelected.length > 0 ? nextSelected : preferredSelection,
  };
}

function normalizeRhythmSelection(selection: ProgressState['exerciseConfig']['rhythm']): ProgressState['exerciseConfig']['rhythm'] {
  if (selection.includes('all')) {
    return ['all'];
  }

  const specifics = [...new Set(selection.filter((item): item is typeof SPECIFIC_RHYTHM_IDS[number] => item !== 'all'))];
  if (specifics.length === 0) {
    return ['all'];
  }

  if (SPECIFIC_RHYTHM_IDS.every((id) => specifics.includes(id))) {
    return ['all'];
  }

  return specifics;
}

function toggleRhythmSelection(
  current: ProgressState['exerciseConfig']['rhythm'],
  option: 'all' | typeof SPECIFIC_RHYTHM_IDS[number],
): ProgressState['exerciseConfig']['rhythm'] {
  if (option === 'all') {
    return ['all'];
  }

  if (current.includes('all')) {
    return [option];
  }

  const next = current.includes(option)
    ? current.filter((id) => id !== option)
    : [...current, option];

  return normalizeRhythmSelection(next);
}

function labelMapFromPitchClasses(pitchClasses: string[]): Record<string, string> {
  return unique(pitchClasses).reduce<Record<string, string>>((result, pitchClass) => {
    result[pitchClass] = DISPLAY_NOTE_LABELS[pitchClass] ?? pitchClass;
    return result;
  }, {});
}

function improvisationOverlayForEvent(
  phrase: Phrase | null,
  currentEventIndex: number,
): ImprovisationOverlayContext {
  if (!phrase) {
    return {
      chordTonePitchClasses: [],
      currentScalePitchClasses: [],
      currentScaleDegreeLabels: {},
      currentScaleNoteLabels: {},
      nextScalePitchClasses: [],
      nextScaleDegreeLabels: {},
      nextScaleNoteLabels: {},
      sharedScalePitchClasses: [],
      allowedPitchClasses: [],
    };
  }

  const event = phrase.events[currentEventIndex];
  const token = event ? phrase.tokensById[event.chordTokenId] : null;
  const currentStep = event ? phrase.progression.steps[event.progressionStepIndex] : null;
  if (!event || !token || !currentStep) {
    return {
      chordTonePitchClasses: [],
      currentScalePitchClasses: [],
      currentScaleDegreeLabels: {},
      currentScaleNoteLabels: {},
      nextScalePitchClasses: [],
      nextScaleDegreeLabels: {},
      nextScaleNoteLabels: {},
      sharedScalePitchClasses: [],
      allowedPitchClasses: [],
    };
  }

  const currentRoot = resolveRomanToChord(phrase.tonic, currentStep.roman).rootPitchClass;
  const currentScalePitchClasses = pitchClassesForScaleIds(
    currentRoot,
    [...currentStep.recommendedScaleIds, ...currentStep.colorScaleIds],
  );
  const currentGuideScaleId = currentStep.recommendedScaleIds[0] ?? currentStep.colorScaleIds[0] ?? null;
  const currentGuidePitchClasses = currentGuideScaleId ? pitchClassesForScale(currentRoot, currentGuideScaleId) : [];
  const currentScaleNoteLabels = labelMapFromPitchClasses(currentGuidePitchClasses);
  const currentScaleGuideLabels = currentGuideScaleId ? degreeLabelsForScale(currentRoot, currentGuideScaleId) : {};

  const nextStep = phrase.progression.steps[event.progressionStepIndex + 1];
  const nextScalePitchClasses = nextStep
    ? pitchClassesForScaleIds(
      resolveRomanToChord(phrase.tonic, nextStep.roman).rootPitchClass,
      [...nextStep.recommendedScaleIds, ...nextStep.colorScaleIds],
    )
    : [];
  const nextGuideScaleId = nextStep ? (nextStep.recommendedScaleIds[0] ?? nextStep.colorScaleIds[0] ?? null) : null;
  const nextGuideRoot = nextStep ? resolveRomanToChord(phrase.tonic, nextStep.roman).rootPitchClass : null;
  const nextGuidePitchClasses = nextGuideScaleId && nextGuideRoot ? pitchClassesForScale(nextGuideRoot, nextGuideScaleId) : [];
  const nextScaleNoteLabels = labelMapFromPitchClasses(nextGuidePitchClasses);
  const nextScaleGuideLabels = nextGuideScaleId && nextGuideRoot ? degreeLabelsForScale(nextGuideRoot, nextGuideScaleId) : {};

  const sharedScalePitchClasses = intersectPitchClasses(currentScalePitchClasses, nextScalePitchClasses);
  const chordTonePitchClasses = unique(token.pitchClasses);
  const allowedPitchClasses = unique([
    ...chordTonePitchClasses,
    ...currentScalePitchClasses,
    ...nextScalePitchClasses,
  ]);

  return {
    chordTonePitchClasses,
    currentScalePitchClasses,
    currentScaleDegreeLabels: currentScaleGuideLabels,
    currentScaleNoteLabels,
    nextScalePitchClasses,
    nextScaleDegreeLabels: nextScaleGuideLabels,
    nextScaleNoteLabels,
    sharedScalePitchClasses,
    allowedPitchClasses,
  };
}

function acceptedFlashcardTokensForEvent(
  phrase: Phrase | null,
  currentEventIndex: number,
  config: ProgressState['exerciseConfig'],
  settings: ProgressState['settings'],
): Phrase['tokensById'][string][] {
  if (!phrase) {
    return [];
  }

  const event = phrase.events[currentEventIndex];
  const step = event ? phrase.progression.steps[event.progressionStepIndex] : null;
  if (!event || !step) {
    return [];
  }

  const selectedVoicings = activeVoicingFamiliesForPractice({
    ...createDefaultProgressState(),
    exerciseConfig: config,
    settings,
  });
  const allowedVoicings = orderedVoicingFamilies(
    selectedVoicings.filter((voicing) => phrase.progression.allowedVoicings.includes(voicing)),
  );
  if (allowedVoicings.length === 0) {
    return [];
  }

  const midiRange = {
    min: settings.registerMin,
    max: settings.registerMax,
  };
  const preferredCenterMidi = preferredCenterForClef(settings.staffClef, midiRange);

  return allowedVoicings.map((voicingFamily) => buildChordToken({
    tonic: phrase.tonic,
    lane: phrase.lane,
    roman: step.roman,
    voicingFamily,
    midiRange,
    maxVoiceMotionSemitones: phrase.progression.maxVoiceMotionSemitones,
    preferredCenterMidi,
  }));
}

function flashcardAttemptStillPossible(
  playedNotes: number[],
  acceptableTokens: Phrase['tokensById'][string][],
): boolean {
  const playedPitchClasses = unique(playedNotes.map((note) => midiToPitchClass(note)));
  if (playedPitchClasses.length === 0) {
    return false;
  }

  return acceptableTokens.some((token) => {
    const allowedPitchClasses = new Set([...token.requiredPitchClasses, ...token.optionalPitchClasses]);
    return playedPitchClasses.every((pitchClass) => allowedPitchClasses.has(pitchClass));
  });
}

export default function App() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const walkthroughDebug = useMemo(() => walkthroughDebugEnabled(), []);
  const micDebugTraceEnabled = useMemo(() => micDebugEnabled(), []);
  const [screen, setScreen] = useState<Screen>('practice');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => loadInitialTheme());
  const [progress, setProgress] = useState<ProgressState>(() => loadProgressState());
  const [walkthroughStep, setWalkthroughStep] = useState<WalkthroughStep | null>(() => loadInitialWalkthroughStep());
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authStatusText, setAuthStatusText] = useState<string | null>(
    isSupabaseConfigured() ? null : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable cloud save.',
  );
  const [cloudSyncState, setCloudSyncState] = useState<'offline' | 'idle' | 'sending_link' | 'syncing' | 'synced' | 'error'>(
    isSupabaseConfigured() ? 'idle' : 'offline',
  );
  const progressRef = useRef<ProgressState>(progress);
  const remoteSyncReadyRef = useRef(false);
  const remoteSyncTimerRef = useRef<number | null>(null);
  const authUserIdRef = useRef<string | null>(null);

  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const phraseRef = useRef<Phrase | null>(null);
  const [scalePromptSeed, setScalePromptSeed] = useState(0);
  const [scalePromptOverrides, setScalePromptOverrides] = useState<{
    scaleId?: ScaleId;
    tonic?: string;
  }>({});
  const [completedScaleNoteIndices, setCompletedScaleNoteIndices] = useState<Set<number>>(new Set());
  const [currentScaleNoteIndex, setCurrentScaleNoteIndex] = useState(0);
  const currentScaleNoteIndexRef = useRef(0);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const currentEventIndexRef = useRef(0);
  const [completedEventIds, setCompletedEventIds] = useState<Set<string>>(new Set());
  const [latestEvaluation, setLatestEvaluation] = useState<EvaluationResult | null>(null);
  const [flashcardScaffoldingVisible, setFlashcardScaffoldingVisible] = useState(false);

  const [midiNotes, setMidiNotes] = useState<Set<number>>(new Set());
  const [keyboardTargetOverrideNotes, setKeyboardTargetOverrideNotes] = useState<number[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  // TODO: Add a voicing lock alongside exercise/key locks so players can drill one
  // progression + voicing shape across all 12 keys without the voicing rotating.
  const [selectionLocks, setSelectionLocks] = useState<SelectionLocks>({ exercise: false, key: false });
  const isRunningRef = useRef(false);

  const [midiState, setMidiState] = useState<MidiConnectionState>(createMidiFallbackState());
  const [micState, setMicState] = useState<MicConnectionState>(createMicFallbackState());
  const [qwertyOctaveShift, setQwertyOctaveShift] = useState(() => defaultQwertyOctaveShiftForClef(progress.settings.staffClef));
  const [practiceTrackingFlashToken, setPracticeTrackingFlashToken] = useState(0);
  const [micEnabled, setMicEnabled] = useState(false);

  const metronomeRef = useRef<Metronome>(new Metronome());
  const previewRef = useRef<PreviewPlayback>(new PreviewPlayback());
  const captureRef = useRef<ChordCapture>(new ChordCapture({ simultaneityWindowMs: 90 }));
  const micCaptureRef = useRef<MicCapture>(new MicCapture());
  const scaleCaptureRef = useRef<ScaleCapture>(new ScaleCapture());
  const midiControllerRef = useRef<MidiAccessController | null>(null);
  const micControllerRef = useRef<MicAccessController | null>(null);
  const qwertyOctaveShiftRef = useRef(defaultQwertyOctaveShiftForClef(progress.settings.staffClef));
  const qwertyPressedNotesRef = useRef<Map<string, number>>(new Map());
  const phraseStartAtMsRef = useRef(0);
  const phraseStartedAtIsoRef = useRef<string | null>(null);
  const previousTokenIdRef = useRef<string | null>(null);
  const previousEventEndNotesRef = useRef<number[]>([]);
  const phraseAttemptHistoryRef = useRef<AttemptRecord[]>([]);
  const pendingAdvanceRef = useRef<PendingChordAdvance | null>(null);
  const carryoverNotesRef = useRef<Set<number>>(new Set());
  const micOverlapRef = useRef<MicOverlapState>({ pitchClasses: [], expiresAt: 0 });
  const suppressCarryoverDisplayRef = useRef(false);
  const previewRequestIdRef = useRef(0);
  const selectionLocksRef = useRef<SelectionLocks>({ exercise: false, key: false });
  const scaleAdvanceTimerRef = useRef<number | null>(null);

  const activeCurriculumPreset = useMemo(
    () => {
      const matchedPresetId = exactCurriculumPresetIdForContentBlocks(progress.exerciseConfig.enabledContentBlockIds);
      return matchedPresetId ? getCurriculumPreset(matchedPresetId) : null;
    },
    [progress.exerciseConfig.enabledContentBlockIds],
  );

  const potentialPhraseVariants = useMemo(() => listPotentialPhraseVariants(progress), [progress]);
  const potentialProgressionCount = useMemo(() => countPotentialProgressions(progress), [progress]);
  const playableScaleTargetCount = useMemo(
    () => listPlayableScaleTargets(progress.exerciseConfig).length,
    [progress.exerciseConfig],
  );
  const inputMode = progress.settings.inputMode;
  const midiInputId = progress.settings.midiInputId;
  const playInputNotes = progress.settings.playInputNotes;
  const practiceCountsTowardProgress = progress.settings.practiceTrackingMode === 'test';

  const deckMasteryPct = useMemo(() => {
    const stats = Object.values(progress.nodeMastery).map((stat) => stat.accuracyEwma);
    if (stats.length === 0) {
      return 0;
    }

    const average = stats.reduce((sum, value) => sum + value, 0) / stats.length;
    return average * 100;
  }, [progress.nodeMastery]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => () => {
    if (scaleAdvanceTimerRef.current !== null) {
      window.clearTimeout(scaleAdvanceTimerRef.current);
    }
  }, []);

  useEffect(() => {
    selectionLocksRef.current = selectionLocks;
  }, [selectionLocks]);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    let active = true;

    const syncSession = async (session: Session | null) => {
      if (!active) {
        return;
      }

      if (!session?.user) {
        authUserIdRef.current = null;
        remoteSyncReadyRef.current = false;
        setAuthEmail(null);
        setCloudSyncState('idle');
        return;
      }

      authUserIdRef.current = session.user.id;
      setAuthEmail(session.user.email ?? null);
      setAuthStatusText(null);
      setCloudSyncState('syncing');
      remoteSyncReadyRef.current = false;

      try {
        const remoteProgress = await loadRemoteProgress(supabase, session.user.id);
        if (!active || authUserIdRef.current !== session.user.id) {
          return;
        }

        if (remoteProgress) {
          progressRef.current = remoteProgress;
          setProgress(remoteProgress);
          saveProgressState(remoteProgress);
        } else {
          await saveRemoteProgress(supabase, session.user.id, progressRef.current);
        }

        remoteSyncReadyRef.current = true;
        setCloudSyncState('synced');
      } catch (error) {
        remoteSyncReadyRef.current = false;
        setCloudSyncState('error');
        setAuthStatusText(error instanceof Error ? error.message : 'Cloud sync failed.');
      }
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setCloudSyncState('error');
        setAuthStatusText(error.message);
        return;
      }

      void syncSession(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncSession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      if (remoteSyncTimerRef.current !== null) {
        window.clearTimeout(remoteSyncTimerRef.current);
        remoteSyncTimerRef.current = null;
      }
    };
  }, [supabase]);

  useEffect(() => {
    qwertyOctaveShiftRef.current = qwertyOctaveShift;
  }, [qwertyOctaveShift]);

  useEffect(() => {
    phraseRef.current = phrase;
  }, [phrase]);

  useEffect(() => {
    currentEventIndexRef.current = currentEventIndex;
  }, [currentEventIndex]);

  useEffect(() => () => {
    previewRef.current.stopInputNotes();
    previewRef.current.stop();
  }, []);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.immersive = progress.settings.immersiveMode ? 'true' : 'false';
  }, [progress.settings.immersiveMode]);

  const commitProgress = useCallback((next: ProgressState) => {
    const normalized = normalizeProgressState(next);
    progressRef.current = normalized;
    setProgress(normalized);
    saveProgressState(normalized);
  }, []);

  const completeWalkthrough = useCallback(() => {
    if (!walkthroughDebug) {
      window.localStorage.setItem(WALKTHROUGH_STORAGE_KEY, 'done');
    }
    setWalkthroughStep(null);
  }, [walkthroughDebug]);

  const dismissWalkthrough = useCallback(() => {
    completeWalkthrough();
  }, [completeWalkthrough]);

  const advanceWalkthrough = useCallback(() => {
    if (!walkthroughStep) {
      return;
    }

    const currentIndex = WALKTHROUGH_STEPS.indexOf(walkthroughStep);
    const nextStep = WALKTHROUGH_STEPS[currentIndex + 1] ?? null;
    if (!nextStep) {
      completeWalkthrough();
      return;
    }

    setWalkthroughStep(nextStep);
  }, [completeWalkthrough, walkthroughStep]);

  useEffect(() => {
    if (!supabase || !remoteSyncReadyRef.current || !authUserIdRef.current) {
      return undefined;
    }

    if (remoteSyncTimerRef.current !== null) {
      window.clearTimeout(remoteSyncTimerRef.current);
    }

    remoteSyncTimerRef.current = window.setTimeout(() => {
      const userId = authUserIdRef.current;
      if (!userId) {
        return;
      }

      setCloudSyncState('syncing');
      void saveRemoteProgress(supabase, userId, progressRef.current)
        .then(() => {
          setCloudSyncState('synced');
          setAuthStatusText(null);
        })
        .catch((error) => {
          setCloudSyncState('error');
          setAuthStatusText(error instanceof Error ? error.message : 'Cloud sync failed.');
        });
    }, 500);

    return () => {
      if (remoteSyncTimerRef.current !== null) {
        window.clearTimeout(remoteSyncTimerRef.current);
        remoteSyncTimerRef.current = null;
      }
    };
  }, [progress, supabase]);

  const requestEmailSignIn = useCallback((email: string) => {
    if (!supabase || email.length === 0) {
      return;
    }

    setCloudSyncState('sending_link');
    setAuthStatusText(null);
    void supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: authRedirectUrl(),
      },
    }).then(({ error }) => {
      if (error) {
        setCloudSyncState('error');
        setAuthStatusText(error.message);
        return;
      }

      setCloudSyncState('idle');
      setAuthStatusText(`Sign-in link sent to ${email}.`);
    });
  }, [supabase]);

  const signOut = useCallback(() => {
    if (!supabase) {
      return;
    }

    void supabase.auth.signOut().then(({ error }) => {
      if (error) {
        setCloudSyncState('error');
        setAuthStatusText(error.message);
        return;
      }

      setAuthStatusText('Signed out. Local progress remains in this browser.');
    });
  }, [supabase]);

  const syncNow = useCallback(() => {
    const userId = authUserIdRef.current;
    if (!supabase || !userId) {
      return;
    }

    setCloudSyncState('syncing');
    setAuthStatusText(null);
    void saveRemoteProgress(supabase, userId, progressRef.current)
      .then(() => {
        setCloudSyncState('synced');
      })
      .catch((error) => {
        setCloudSyncState('error');
        setAuthStatusText(error instanceof Error ? error.message : 'Cloud sync failed.');
      });
  }, [supabase]);

  const updateCurrentEventIndex = useCallback((nextIndex: number) => {
    currentEventIndexRef.current = nextIndex;
    setCurrentEventIndex(nextIndex);
  }, []);

  const resetPracticeSurface = useCallback((nextPhrase: Phrase | null) => {
    setPhrase(nextPhrase);
    setCompletedScaleNoteIndices(new Set());
    currentScaleNoteIndexRef.current = 0;
    setCurrentScaleNoteIndex(0);
    updateCurrentEventIndex(0);
    setCompletedEventIds(new Set());
    setLatestEvaluation(null);
    setFlashcardScaffoldingVisible(false);
    setMidiNotes(new Set(
      progressRef.current.exerciseConfig.mode === 'scale'
        ? scaleCaptureRef.current.activeNoteNumbers
        : captureRef.current.activeNoteNumbers,
    ));
    metronomeRef.current.stop();
    setIsRunning(false);
    isRunningRef.current = false;
    phraseStartAtMsRef.current = 0;
    phraseStartedAtIsoRef.current = null;
    previousTokenIdRef.current = null;
    previousEventEndNotesRef.current = [];
    phraseAttemptHistoryRef.current = [];
    pendingAdvanceRef.current = null;
    captureRef.current.clearRecent();
    micCaptureRef.current.clearRecent();
    micOverlapRef.current = { pitchClasses: [], expiresAt: 0 };
    scaleCaptureRef.current.clear();
  }, [updateCurrentEventIndex]);

  const scalePrompt = useMemo<ScalePrompt | null>(() => {
    if (progress.exerciseConfig.mode !== 'scale') {
      return null;
    }

    try {
      return generateScalePrompt({
        config: progress.exerciseConfig,
        progress,
        promptNonce: scalePromptSeed,
        scaleIdOverride: scalePromptOverrides.scaleId,
        tonicOverride: scalePromptOverrides.tonic,
      });
    } catch (error) {
      console.error('Unable to generate scale prompt.', error);
      return null;
    }
  }, [
    progress,
    scalePromptOverrides,
    scalePromptSeed,
  ]);

  useEffect(() => {
    currentScaleNoteIndexRef.current = 0;
  }, [scalePrompt?.id]);

  const regenerateScalePrompt = useCallback((overrides: {
    scaleId?: ScaleId;
    tonic?: string;
  }) => {
    setScalePromptOverrides(overrides);
    setScalePromptSeed((current) => current + 1);
  }, []);

  const syncVisibleMidiNotes = useCallback(() => {
    if (inputMode === 'mic') {
      setMidiNotes(new Set(micCaptureRef.current.activeNoteNumbers));
      return;
    }

    setMidiNotes(new Set(
      progressRef.current.exerciseConfig.mode === 'scale'
        ? scaleCaptureRef.current.activeNoteNumbers
      : captureRef.current.activeNoteNumbers,
    ));
  }, [inputMode]);
  const keyboardActiveNotes = midiNotes;

  useEffect(() => {
    if (!micDebugTraceEnabled) {
      micCaptureRef.current.setDebugLogger(null);
      return;
    }

    micCaptureRef.current.setDebugLogger((event: MicCaptureDebugEvent) => {
      console.debug('[mic-chord-debug]', event.type, {
        t: Math.round(event.timestamp),
        ...event.payload,
      });
    });
  }, [micDebugTraceEnabled]);

  const reconcileCarryoverDisplay = useCallback(() => {
    if (!suppressCarryoverDisplayRef.current) {
      return;
    }

    const activeNotes = captureRef.current.activeNoteNumbers;
    carryoverNotesRef.current = new Set(
      Array.from(carryoverNotesRef.current).filter((note) => activeNotes.has(note)),
    );

    if (carryoverNotesRef.current.size === 0) {
      suppressCarryoverDisplayRef.current = false;
      setKeyboardTargetOverrideNotes(null);
    }
  }, []);

  const currentRequiredPitchClasses = useCallback(() => {
    const workingPhrase = phraseRef.current;
    const targetEvent = workingPhrase?.events[currentEventIndexRef.current] ?? null;
    return targetEvent
      ? workingPhrase?.tokensById[targetEvent.chordTokenId]?.requiredPitchClasses ?? []
      : [];
  }, []);

  const beatOffsetForEvent = useCallback((event: PhraseEvent) => (
    ((event.bar - 1) * 4) + (event.beat - 1)
  ), []);

  const currentMetronomeBeatOffset = useCallback((atMs = performance.now()) => {
    const workingPhrase = phraseRef.current;
    if (!workingPhrase || phraseStartAtMsRef.current <= 0) {
      return 0;
    }

    const msPerBeat = 60000 / workingPhrase.tempo;
    return Math.max(0, (atMs - phraseStartAtMsRef.current) / msPerBeat);
  }, []);

  const unlockSelectionLocks = useCallback(() => {
    const nextLocks: SelectionLocks = { exercise: false, key: false };
    selectionLocksRef.current = nextLocks;
    setSelectionLocks(nextLocks);
  }, []);

  const toggleSelectionLock = useCallback((target: keyof SelectionLocks) => {
    setSelectionLocks((current) => {
      const next = { ...current, [target]: !current[target] };
      selectionLocksRef.current = next;
      return next;
    });
  }, []);

  const generateNextPhrase = useCallback((state: ProgressState) => {
    if (state.exerciseConfig.mode === 'scale') {
      setKeyboardTargetOverrideNotes(null);
      resetPracticeSurface(null);
      regenerateScalePrompt({
        scaleId: selectionLocksRef.current.exercise ? scalePrompt?.scaleId : undefined,
        tonic: selectionLocksRef.current.key ? scalePrompt?.tonic : undefined,
      });
      return;
    }

    if (playableProgressionIds(state.exerciseConfig, state).length === 0) {
      setKeyboardTargetOverrideNotes(null);
      resetPracticeSurface(null);
      return;
    }

    carryoverNotesRef.current = new Set(captureRef.current.activeNoteNumbers);
    suppressCarryoverDisplayRef.current = carryoverNotesRef.current.size > 0;
    if (suppressCarryoverDisplayRef.current) {
      const persistedCarryoverTarget = previousEventEndNotesRef.current.length > 0
        ? [...previousEventEndNotesRef.current]
        : Array.from(carryoverNotesRef.current).sort((a, b) => a - b);
      setKeyboardTargetOverrideNotes(persistedCarryoverTarget);
    } else {
      setKeyboardTargetOverrideNotes(null);
    }
    const useKeyboardFriendlyRange = inputMode === 'qwerty';
    const lockedPhrase = phraseRef.current;
    const progressionOverrideId = selectionLocksRef.current.exercise ? lockedPhrase?.progressionId : undefined;
    const tonicOverride = selectionLocksRef.current.key ? lockedPhrase?.tonic : undefined;
    let nextPhrase: Phrase;
    try {
      nextPhrase = generatePhrase({
        config: state.exerciseConfig,
        progress: state,
        tempo: state.settings.tempo,
        midiRange: useKeyboardFriendlyRange
          ? qwertyFriendlyRangeForOctaveShift(qwertyOctaveShiftRef.current)
          : undefined,
        previousPhrase: (
          (state.exerciseConfig.mode === 'improvisation'
            && state.exerciseConfig.improvisationProgressionMode === 'chained')
          || (state.exerciseConfig.mode === 'guided'
            && state.exerciseConfig.guidedFlowMode === 'musical_chaining')
          || state.exerciseConfig.mode === 'chord_flashcards'
        )
          ? phraseRef.current
          : null,
        progressionOverrideId,
        tonicOverride,
      });
    } catch (error) {
      console.error('Unable to generate next phrase.', error);
      setKeyboardTargetOverrideNotes(null);
      resetPracticeSurface(null);
      return;
    }
    resetPracticeSurface(nextPhrase);
  }, [inputMode, regenerateScalePrompt, resetPracticeSurface, scalePrompt]);

  const generateSelectedPhrase = useCallback((
    config: ProgressState['exerciseConfig'],
    options: {
      tonicOverride?: string;
      progressionOverrideId?: string;
      voicingFamilyOverride?: VoicingFamily;
    } = {},
  ) => {
    if (config.mode === 'scale') {
      setKeyboardTargetOverrideNotes(null);
      resetPracticeSurface(null);
      regenerateScalePrompt({
        scaleId: options.progressionOverrideId as ScaleId | undefined,
        tonic: options.tonicOverride,
      });
      return;
    }

    const useKeyboardFriendlyRange = inputMode === 'qwerty';

    carryoverNotesRef.current = new Set(captureRef.current.activeNoteNumbers);
    suppressCarryoverDisplayRef.current = false;
    setKeyboardTargetOverrideNotes(null);

    try {
      const nextPhrase = generatePhrase({
        config,
        progress: {
          ...progressRef.current,
          exerciseConfig: config,
        },
        tempo: progressRef.current.settings.tempo,
        midiRange: useKeyboardFriendlyRange
          ? qwertyFriendlyRangeForOctaveShift(qwertyOctaveShiftRef.current)
          : undefined,
        tonicOverride: options.tonicOverride,
        progressionOverrideId: options.progressionOverrideId,
        voicingFamilyOverride: options.voicingFamilyOverride,
      });

      resetPracticeSurface(nextPhrase);
    } catch (error) {
      console.error('Unable to generate selected phrase.', error);
      resetPracticeSurface(null);
    }
  }, [inputMode, regenerateScalePrompt, resetPracticeSurface]);

  const stepCurrentKey = useCallback((direction: 'clockwise' | 'counterclockwise') => {
    if (progressRef.current.exerciseConfig.mode === 'scale') {
      if (!scalePrompt) {
        return;
      }

      const scaleRoots = resolveIncludedKeyRootsForScale(
        progressRef.current.exerciseConfig.keySet,
        progressRef.current.exerciseConfig.includedKeyRoots,
        scalePrompt.scaleId,
      );
      if (scaleRoots.length <= 1) {
        return;
      }

      const nextRoot = nextRootOnCircle(scalePrompt.tonic, scaleRoots, direction);
      if (!nextRoot || nextRoot === scalePrompt.tonic) {
        return;
      }

      generateSelectedPhrase(progressRef.current.exerciseConfig, {
        tonicOverride: nextRoot,
        progressionOverrideId: scalePrompt.scaleId,
      });
      return;
    }

    const workingPhrase = phraseRef.current;
    if (!workingPhrase) {
      return;
    }

    const allowedRoots = resolveIncludedKeyRootsForLane(
      progressRef.current.exerciseConfig.keySet,
      progressRef.current.exerciseConfig.includedKeyRoots,
      workingPhrase.lane,
    );
    if (allowedRoots.length <= 1) {
      return;
    }

    const nextRoot = nextRootOnCircle(workingPhrase.tonic, allowedRoots, direction);
    if (!nextRoot || nextRoot === workingPhrase.tonic) {
      return;
    }

    const firstToken = workingPhrase.events[0]
      ? workingPhrase.tokensById[workingPhrase.events[0].chordTokenId]
      : null;
    generateSelectedPhrase(progressRef.current.exerciseConfig, {
      tonicOverride: nextRoot,
      progressionOverrideId: workingPhrase.progressionId,
      voicingFamilyOverride: firstToken?.voicingFamily,
    });
  }, [generateSelectedPhrase, scalePrompt]);

  const stepCurrentExercise = useCallback((direction: 'forward' | 'backward') => {
    if (progressRef.current.exerciseConfig.mode === 'scale') {
      if (!scalePrompt) {
        return;
      }

      const scaleIds = [...new Set(
        listPlayableScaleTargets(progressRef.current.exerciseConfig)
          .filter((target) => target.tonic === scalePrompt.tonic)
          .map((target) => target.scaleId),
      )];
      if (scaleIds.length <= 1) {
        return;
      }

      const currentIndex = scaleIds.indexOf(scalePrompt.scaleId);
      const directionOffset = direction === 'forward' ? 1 : -1;
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (baseIndex + directionOffset + scaleIds.length) % scaleIds.length;
      const nextScaleId = scaleIds[nextIndex];
      if (!nextScaleId || nextScaleId === scalePrompt.scaleId) {
        return;
      }

      generateSelectedPhrase(progressRef.current.exerciseConfig, {
        tonicOverride: scalePrompt.tonic,
        progressionOverrideId: nextScaleId,
      });
      return;
    }

    const workingPhrase = phraseRef.current;
    if (!workingPhrase) {
      return;
    }

    const progressionIds = playableProgressionIds(progressRef.current.exerciseConfig, progressRef.current);
    if (progressionIds.length <= 1) {
      return;
    }

    const currentIndex = progressionIds.indexOf(workingPhrase.progressionId);
    const directionOffset = direction === 'forward' ? 1 : -1;
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + directionOffset + progressionIds.length) % progressionIds.length;
    const nextProgressionId = progressionIds[nextIndex];
    if (!nextProgressionId || nextProgressionId === workingPhrase.progressionId) {
      return;
    }

    const firstToken = workingPhrase.events[0]
      ? workingPhrase.tokensById[workingPhrase.events[0].chordTokenId]
      : null;
    generateSelectedPhrase(progressRef.current.exerciseConfig, {
      tonicOverride: workingPhrase.tonic,
      progressionOverrideId: nextProgressionId,
      voicingFamilyOverride: firstToken?.voicingFamily,
    });
  }, [generateSelectedPhrase, scalePrompt]);

  const selectCurrentExercise = useCallback((progressionId: string) => {
    if (progressRef.current.exerciseConfig.mode === 'scale') {
      if (!scalePrompt || progressionId === scalePrompt.scaleId) {
        return;
      }

      generateSelectedPhrase(progressRef.current.exerciseConfig, {
        tonicOverride: scalePrompt.tonic,
        progressionOverrideId: progressionId,
      });
      return;
    }

    const workingPhrase = phraseRef.current;
    if (!workingPhrase || progressionId === workingPhrase.progressionId) {
      return;
    }

    const firstToken = workingPhrase.events[0]
      ? workingPhrase.tokensById[workingPhrase.events[0].chordTokenId]
      : null;
    generateSelectedPhrase(progressRef.current.exerciseConfig, {
      tonicOverride: workingPhrase.tonic,
      progressionOverrideId: progressionId,
      voicingFamilyOverride: firstToken?.voicingFamily,
    });
  }, [generateSelectedPhrase, scalePrompt]);

  useEffect(() => {
    if (progress.exerciseConfig.mode === 'scale') {
      if (!scalePrompt && playableScaleTargetCount > 0) {
        generateNextPhrase(progressRef.current);
      }
      return;
    }

    if (!phrase && potentialProgressionCount > 0) {
      generateNextPhrase(progressRef.current);
    }
  }, [phrase, scalePrompt, generateNextPhrase, playableScaleTargetCount, potentialProgressionCount, progress.exerciseConfig.mode]);

  const finishPhrase = useCallback((workingProgress: ProgressState, targetPhrase: Phrase) => {
    const attempts = phraseAttemptHistoryRef.current;
    const successes = attempts.filter((attempt) => attempt.success).length;
    const accuracy = attempts.length > 0 ? successes / attempts.length : 0;
    const medianTransitionLatencyMs = median(attempts.map((attempt) => attempt.latencyMs));

    if (progressRef.current.settings.practiceTrackingMode !== 'test') {
      metronomeRef.current.stop();
      setIsRunning(false);
      isRunningRef.current = false;
      pendingAdvanceRef.current = null;
      generateNextPhrase(workingProgress);
      return;
    }

    let next = pushSession(workingProgress, {
      id: makeSessionId(),
      mode: workingProgress.exerciseConfig.mode,
      curriculumPresetId: workingProgress.exerciseConfig.curriculumPresetId,
      lane: targetPhrase.lane,
      startedAt: phraseStartedAtIsoRef.current ?? nowIso(),
      endedAt: nowIso(),
      phraseIds: [targetPhrase.id],
      accuracy,
      medianTransitionLatencyMs,
    });

    const unlockResult = applyUnlockDecision(next, targetPhrase.lane);
    next = unlockResult.progress;

    commitProgress(next);
    metronomeRef.current.stop();
    setIsRunning(false);
    isRunningRef.current = false;
    pendingAdvanceRef.current = null;
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const commitPendingAdvanceIfReady = useCallback((nowMs: number, triggerMessage?: ParsedMidiMessage): boolean => {
    const pending = pendingAdvanceRef.current;
    if (!pending) {
      return false;
    }

    if (pending.requiresSustainRelease) {
      const startedNewAttack = triggerMessage?.type === 'note_on'
        && !pending.acceptedNotes.includes(triggerMessage.noteNumber);
      const timeoutElapsed = (nowMs - pending.submittedAtMs) >= FOOTPEDAL_RELEASE_WINDOW_MS;
      const isSustainRelease = triggerMessage?.type === 'sustain' && !triggerMessage.isDown;

      if (startedNewAttack || timeoutElapsed) {
        pendingAdvanceRef.current = null;
        return false;
      }

      if (!isSustainRelease) {
        return false;
      }

      const heldNotes = Array.from(captureRef.current.heldNoteNumbers);
      pendingAdvanceRef.current = null;
      previousEventEndNotesRef.current = carryoverNotesAfterAdvance(heldNotes, pending.acceptedNotes);

      let nextProgress = progressRef.current;
      if (pending.pendingResult) {
        setLatestEvaluation(pending.pendingResult);
        if (pending.pendingResult.success) {
          setStreak((value) => value + 1);
        } else {
          setStreak(0);
        }
      }
      if (pending.eventId) {
        const eventId = pending.eventId;
        setCompletedEventIds((previous) => {
          const next = new Set(previous);
          next.add(eventId);
          return next;
        });
      }
      if (pending.tokenId) {
        previousTokenIdRef.current = pending.tokenId;
      }
      if (pending.pendingAttemptRecord) {
        phraseAttemptHistoryRef.current = [...phraseAttemptHistoryRef.current, pending.pendingAttemptRecord];
      }
      if (
        progressRef.current.settings.practiceTrackingMode === 'test'
        && pending.tokenId
        && pending.pendingResult
        && pending.pendingAttemptRecord
      ) {
        nextProgress = applyMasteryUpdate(
          progressRef.current,
          pending.tokenId,
          pending.pendingResult,
          pending.pendingAttemptRecord.at,
          pending.transitionFromTokenId ?? null,
        );
        nextProgress = pushAttempt(nextProgress, pending.pendingAttemptRecord);
        commitProgress(nextProgress);
      }

      if (pending.completedPhrase) {
        finishPhrase(nextProgress, pending.completedPhrase);
        return true;
      }
      if (pending.nextIndex !== null) {
        updateCurrentEventIndex(pending.nextIndex);
      }
      return true;
    }

    const heldNotes = Array.from(captureRef.current.heldNoteNumbers);
    if (hasAcceptedNotesStillHeld(heldNotes, pending.acceptedNotes)) {
      return false;
    }

    pendingAdvanceRef.current = null;
    previousEventEndNotesRef.current = carryoverNotesAfterAdvance(heldNotes, pending.acceptedNotes);

    let nextProgress = progressRef.current;
    if (pending.pendingResult) {
      setLatestEvaluation(pending.pendingResult);
      if (pending.pendingResult.success) {
        setStreak((value) => value + 1);
      } else {
        setStreak(0);
      }
    }
    if (pending.eventId) {
      const eventId = pending.eventId;
      setCompletedEventIds((previous) => {
        const next = new Set(previous);
        next.add(eventId);
        return next;
      });
    }
    if (pending.tokenId) {
      previousTokenIdRef.current = pending.tokenId;
    }
    if (pending.pendingAttemptRecord) {
      phraseAttemptHistoryRef.current = [...phraseAttemptHistoryRef.current, pending.pendingAttemptRecord];
    }
    if (
      progressRef.current.settings.practiceTrackingMode === 'test'
      && pending.tokenId
      && pending.pendingResult
      && pending.pendingAttemptRecord
    ) {
      nextProgress = applyMasteryUpdate(
        progressRef.current,
        pending.tokenId,
        pending.pendingResult,
        pending.pendingAttemptRecord.at,
        pending.transitionFromTokenId ?? null,
      );
      nextProgress = pushAttempt(nextProgress, pending.pendingAttemptRecord);
      commitProgress(nextProgress);
    }

    if (pending.completedPhrase) {
      finishPhrase(nextProgress, pending.completedPhrase);
      return true;
    }
    if (pending.nextIndex !== null) {
      updateCurrentEventIndex(pending.nextIndex);
    }
    return true;
  }, [commitProgress, finishPhrase, updateCurrentEventIndex]);

  const submitAttempt = useCallback((
    playedNotes: number[],
    submittedAtMs: number,
    submissionReason: 'required_detected' | 'burst_closed',
    options: AttemptSubmissionOptions = {},
  ) => {
    const workingPhrase = phraseRef.current;
    if (!workingPhrase) {
      return;
    }

    const eventIndex = currentEventIndexRef.current;
    const event = workingPhrase.events[eventIndex];
    if (!event) {
      return;
    }

    const token = workingPhrase.tokensById[event.chordTokenId];
    if (!token) {
      return;
    }

    const isImprovisationMode = progressRef.current.exerciseConfig.mode === 'improvisation';
    const isFlashcardMode = progressRef.current.exerciseConfig.mode === 'chord_flashcards';
    const inputSource = options.inputSource ?? inputMode;
    const isMicInput = inputSource === 'mic';
    const rawDetectedPitchClasses = options.detectedPitchClasses
      ?? unique(playedNotes.map((note) => midiToPitchClass(note)));
    if (isImprovisationMode && submissionReason !== 'required_detected') {
      return;
    }

    const msPerBeat = 60000 / workingPhrase.tempo;
    const eventBeatOffset = beatOffsetForEvent(event);
    if (!isRunningRef.current) {
      phraseStartAtMsRef.current = submittedAtMs - (eventBeatOffset * msPerBeat);
      phraseStartedAtIsoRef.current = nowIso();
      setIsRunning(true);
      isRunningRef.current = true;
      if (!isFlashcardMode && progressRef.current.settings.metronomeEnabled) {
        void metronomeRef.current.start(workingPhrase.tempo, { beatOffsetBeats: eventBeatOffset });
      }
    }

    const expectedTimeMs = isFlashcardMode
      ? submittedAtMs
      : phraseStartAtMsRef.current + (eventBeatOffset * msPerBeat);

    const acceptableFlashcardTokens = isFlashcardMode
      ? acceptedFlashcardTokensForEvent(
        workingPhrase,
        eventIndex,
        progressRef.current.exerciseConfig,
        progressRef.current.settings,
      )
      : [];
    const allowedMicPitchClasses = isImprovisationMode
      ? improvisationOverlayForEvent(workingPhrase, eventIndex).allowedPitchClasses
      : isFlashcardMode
        ? unique(acceptableFlashcardTokens.flatMap((candidate) => [
          ...candidate.requiredPitchClasses,
          ...candidate.optionalPitchClasses,
        ]))
        : unique([
          ...token.requiredPitchClasses,
          ...token.optionalPitchClasses,
        ]);
    const preserveAllowedMicOverlap = isImprovisationMode || previousTokenIdRef.current === token.id;
    const detectedPitchClasses = isMicInput
      ? filterMicOverlapPitchClasses(
        rawDetectedPitchClasses,
        allowedMicPitchClasses,
        activeMicOverlapPitchClasses(micOverlapRef.current, submittedAtMs),
        { preserveAllowedOverlap: preserveAllowedMicOverlap },
      )
      : rawDetectedPitchClasses;

    if (isMicInput && detectedPitchClasses.length === 0) {
      return;
    }

    const result = isImprovisationMode
      ? (isMicInput
        ? evaluateMicImprovisationAttempt({
          targetToken: token,
          detectedPitchClasses,
          allowedPitchClasses: allowedMicPitchClasses,
          expectedTimeMs,
          submittedAtMs,
        })
        : evaluateImprovisationAttempt({
          targetToken: token,
          playedNotes,
          allowedPitchClasses: improvisationOverlayForEvent(workingPhrase, eventIndex).allowedPitchClasses,
          expectedTimeMs,
          submittedAtMs,
          scoringMode: progressRef.current.settings.scoringMode,
        }))
      : isFlashcardMode
        ? (isMicInput
          ? evaluateMicFlashcardAttempt({
            acceptableTokens: acceptableFlashcardTokens,
            detectedPitchClasses,
            expectedTimeMs,
            submittedAtMs,
          })
          : evaluateFlashcardAttempt({
            acceptableTokens: acceptableFlashcardTokens,
            playedNotes,
            expectedTimeMs,
            submittedAtMs,
            scoringMode: progressRef.current.settings.scoringMode,
            previousEventEndNotes: previousEventEndNotesRef.current,
          }))
      : (isMicInput
        ? evaluateMicAttempt({
          targetToken: token,
          detectedPitchClasses,
          expectedTimeMs,
          submittedAtMs,
        })
        : evaluateAttempt({
          targetToken: token,
          playedNotes,
          expectedTimeMs,
          submittedAtMs,
          scoringMode: progressRef.current.settings.scoringMode,
          previousEventEndNotes: previousEventEndNotesRef.current,
        }));

    const deferFlashcardMiss = isFlashcardMode
      && !isMicInput
      && submissionReason === 'burst_closed'
      && !result.success
      && flashcardAttemptStillPossible(playedNotes, acceptableFlashcardTokens);

    if (deferFlashcardMiss) {
      pendingAdvanceRef.current = null;
      return;
    }

    setLatestEvaluation(result);
    if (!result.success && isFlashcardMode) {
      setFlashcardScaffoldingVisible(true);
    }

    let nextProgress = progressRef.current;

    const attemptRecord: AttemptRecord = {
      id: makeAttemptId(),
      at: nowIso(),
      lane: workingPhrase.lane,
      tokenId: token.id,
      transitionFromTokenId: previousTokenIdRef.current,
      success: result.success,
      accuracy: result.accuracy,
      latencyMs: result.latencyMs,
      focusType: workingPhrase.focusType,
    };

    if (!isImprovisationMode && practiceCountsTowardProgress) {
      nextProgress = applyMasteryUpdate(
        progressRef.current,
        token.id,
        result,
        nowIso(),
        previousTokenIdRef.current,
      );
      nextProgress = pushAttempt(nextProgress, attemptRecord);
      commitProgress(nextProgress);
    }

    if (!isImprovisationMode) {
      phraseAttemptHistoryRef.current = [...phraseAttemptHistoryRef.current, attemptRecord];
    }

    const hasBlockingPitchError = isFlashcardMode
      ? !result.success
      : result.errors.some((error) =>
        ['missing_required_tone', 'outside_allowed_scale', 'wrong_target_notes'].includes(error.code),
      );

    if (hasBlockingPitchError) {
      setStreak(0);
      pendingAdvanceRef.current = null;
      return;
    }

    if (isImprovisationMode) {
      const isLastEvent = eventIndex >= workingPhrase.events.length - 1;
      if (
        progressRef.current.exerciseConfig.improvisationAdvanceMode === 'footpedal_release'
        && inputMode === 'midi'
      ) {
        pendingAdvanceRef.current = {
          nextIndex: isLastEvent ? null : eventIndex + 1,
          acceptedNotes: [...playedNotes],
          submittedAtMs,
          requiresSustainRelease: true,
          eventId: event.id,
          tokenId: token.id,
          transitionFromTokenId: previousTokenIdRef.current,
          pendingResult: result,
          pendingAttemptRecord: attemptRecord,
          completedPhrase: isLastEvent ? workingPhrase : undefined,
        };
        captureRef.current.clearRecent();
        return;
      }

      if (practiceCountsTowardProgress) {
        nextProgress = applyMasteryUpdate(
          progressRef.current,
          token.id,
          result,
          attemptRecord.at,
          previousTokenIdRef.current,
        );
        nextProgress = pushAttempt(nextProgress, attemptRecord);
        commitProgress(nextProgress);
      }

      phraseAttemptHistoryRef.current = [...phraseAttemptHistoryRef.current, attemptRecord];
      setCompletedEventIds((previous) => {
        const next = new Set(previous);
        next.add(event.id);
        return next;
      });
      previousTokenIdRef.current = token.id;
      if (result.success) {
        setStreak((value) => value + 1);
      } else {
        setStreak(0);
      }

      if (isMicInput) {
        micOverlapRef.current = nextMicOverlapState(detectedPitchClasses, submittedAtMs);
        micCaptureRef.current.clearRecent();
        if (isLastEvent) {
          finishPhrase(nextProgress, workingPhrase);
          return;
        }

        updateCurrentEventIndex(eventIndex + 1);
        return;
      }

      if (isLastEvent) {
        pendingAdvanceRef.current = {
          nextIndex: null,
          acceptedNotes: [...playedNotes],
          submittedAtMs,
          completedPhrase: workingPhrase,
        };
        return;
      }

      pendingAdvanceRef.current = {
        nextIndex: eventIndex + 1,
        acceptedNotes: [...playedNotes],
        submittedAtMs,
      };
      return;
    }

    if (result.success) {
      setStreak((value) => value + 1);
    } else {
      setStreak(0);
    }
    setCompletedEventIds((previous) => {
      const next = new Set(previous);
      next.add(event.id);
      return next;
    });

    previousTokenIdRef.current = token.id;
    previousEventEndNotesRef.current = isMicInput ? [] : playedNotes;

    const isLastEvent = eventIndex >= workingPhrase.events.length - 1;
    if (isMicInput) {
      micOverlapRef.current = nextMicOverlapState(detectedPitchClasses, submittedAtMs);
      micCaptureRef.current.clearRecent();
      if (isLastEvent) {
        finishPhrase(nextProgress, workingPhrase);
        return;
      }

      updateCurrentEventIndex(eventIndex + 1);
      return;
    }

    if (isLastEvent) {
      pendingAdvanceRef.current = {
        nextIndex: null,
        acceptedNotes: [...playedNotes],
        submittedAtMs,
        completedPhrase: workingPhrase,
      };
      return;
    }

    pendingAdvanceRef.current = {
      nextIndex: eventIndex + 1,
      acceptedNotes: [...playedNotes],
      submittedAtMs,
    };
  }, [beatOffsetForEvent, commitProgress, finishPhrase, inputMode, practiceCountsTowardProgress, updateCurrentEventIndex]);

  const handleNoteMessage = useCallback((message: ParsedMidiMessage) => {
    if (playInputNotes) {
      if (message.type === 'note_on') {
        void previewRef.current.playInputNote(message.noteNumber);
      } else if (message.type === 'note_off') {
        previewRef.current.releaseInputNote(message.noteNumber);
      }
    }

    const isScaleMode = progressRef.current.exerciseConfig.mode === 'scale';
    if (isScaleMode) {
      scaleCaptureRef.current.ingest(message);
    }
    const submission = isScaleMode
      ? null
      : captureRef.current.ingest(
        message,
        pendingAdvanceRef.current ? [] : currentRequiredPitchClasses(),
      );
    if (!isScaleMode) {
      reconcileCarryoverDisplay();
    }
    syncVisibleMidiNotes();

    if (screen !== 'practice') {
      return;
    }

    if (isScaleMode) {
      if (!scalePrompt || message.type !== 'note_on') {
        return;
      }

      const expectedIndex = currentScaleNoteIndexRef.current;
      const expectedNote = scalePrompt.noteSequence[expectedIndex];
      if (!expectedNote) {
        return;
      }

      if (message.pitchClass !== midiToPitchClass(expectedNote.midi)) {
        setStreak(0);
        return;
      }

      const nextIndex = expectedIndex + 1;
      currentScaleNoteIndexRef.current = nextIndex;
      setCompletedScaleNoteIndices((current) => {
        const next = new Set(current);
        next.add(expectedIndex);
        return next;
      });
      setCurrentScaleNoteIndex(nextIndex);
      setStreak((value) => value + 1);

      if (nextIndex >= scalePrompt.noteSequence.length) {
        if (scaleAdvanceTimerRef.current !== null) {
          window.clearTimeout(scaleAdvanceTimerRef.current);
        }
        scaleAdvanceTimerRef.current = window.setTimeout(() => {
          generateNextPhrase(progressRef.current);
        }, 260);
      }
      return;
    }

    if (suppressCarryoverDisplayRef.current) {
      return;
    }

    const nowMs = performance.now();
    const didAdvance = commitPendingAdvanceIfReady(nowMs, message);
    if (pendingAdvanceRef.current) {
      return;
    }

    const readySubmission = didAdvance
      ? captureRef.current.flush(nowMs, currentRequiredPitchClasses())
      : submission;

    if (readySubmission) {
      submitAttempt(readySubmission.notes, readySubmission.timestamp, readySubmission.reason);
    }
  }, [
    playInputNotes,
    generateNextPhrase,
    screen,
    commitPendingAdvanceIfReady,
    currentRequiredPitchClasses,
    reconcileCarryoverDisplay,
    scalePrompt,
    submitAttempt,
    syncVisibleMidiNotes,
  ]);

  const noteMessageRef = useRef(handleNoteMessage);
  useEffect(() => {
    noteMessageRef.current = handleNoteMessage;
  }, [handleNoteMessage]);

  const handleMicObservation = useCallback((observation: PitchObservation) => {
    if (inputMode !== 'mic') {
      return;
    }

    const isScaleMode = progressRef.current.exerciseConfig.mode === 'scale';
    const { stableEvent, activeChanged, submission } = isScaleMode
      ? micCaptureRef.current.ingestScale(observation)
      : micCaptureRef.current.ingestChord(
        observation,
        pendingAdvanceRef.current ? [] : currentRequiredPitchClasses(),
      );
    if (activeChanged) {
      syncVisibleMidiNotes();
    }

    if (stableEvent) {
      syncVisibleMidiNotes();
    }

    if (isScaleMode) {
      if (!stableEvent) {
        return;
      }

      if (!scalePrompt) {
        return;
      }

      const expectedIndex = currentScaleNoteIndexRef.current;
      const expectedNote = scalePrompt.noteSequence[expectedIndex];
      if (!expectedNote) {
        return;
      }

      if (stableEvent.pitchClass !== midiToPitchClass(expectedNote.midi)) {
        return;
      }

      const nextIndex = expectedIndex + 1;
      currentScaleNoteIndexRef.current = nextIndex;
      setCompletedScaleNoteIndices((current) => {
        const next = new Set(current);
        next.add(expectedIndex);
        return next;
      });
      setCurrentScaleNoteIndex(nextIndex);
      setStreak((value) => value + 1);

      if (nextIndex >= scalePrompt.noteSequence.length) {
        if (scaleAdvanceTimerRef.current !== null) {
          window.clearTimeout(scaleAdvanceTimerRef.current);
        }
        scaleAdvanceTimerRef.current = window.setTimeout(() => {
          generateNextPhrase(progressRef.current);
        }, 260);
      }
      return;
    }

    if (submission) {
      if (micDebugTraceEnabled) {
        const workingPhrase = phraseRef.current;
        const eventIndex = currentEventIndexRef.current;
        const event = workingPhrase?.events[eventIndex] ?? null;
        const token = event ? workingPhrase?.tokensById[event.chordTokenId] ?? null : null;
        console.debug('[mic-chord-debug] app_submission', {
          t: Math.round(submission.timestamp),
          eventIndex,
          tokenId: token?.id ?? null,
          requiredPitchClasses: token?.requiredPitchClasses ?? [],
          optionalPitchClasses: token?.optionalPitchClasses ?? [],
          detectedPitchClasses: submission.pitchClasses,
          reason: submission.reason,
          pendingAdvanceBlocked: Boolean(pendingAdvanceRef.current),
        });
      }
      submitAttempt(submission.notes, submission.timestamp, submission.reason, {
        inputSource: 'mic',
        detectedPitchClasses: submission.pitchClasses,
      });
    }
  }, [currentRequiredPitchClasses, generateNextPhrase, inputMode, micDebugTraceEnabled, scalePrompt, submitAttempt, syncVisibleMidiNotes]);

  const micObservationRef = useRef(handleMicObservation);
  useEffect(() => {
    micObservationRef.current = handleMicObservation;
  }, [handleMicObservation]);

  const releaseAllQwertyNotes = useCallback(() => {
    if (qwertyPressedNotesRef.current.size === 0) {
      return;
    }

    const now = performance.now();
    const activeNotes = [...qwertyPressedNotesRef.current.values()];
    qwertyPressedNotesRef.current.clear();
    activeNotes.forEach((noteNumber) => {
      noteMessageRef.current(createSyntheticNoteMessage('note_off', noteNumber, now));
    });
  }, []);

  useEffect(() => {
    if (inputMode !== 'midi') {
      midiControllerRef.current?.disconnect();
      midiControllerRef.current = null;
      return;
    }

    const midiController = new MidiAccessController({
      onMessage: (message) => {
        if (progressRef.current.settings.inputMode === 'midi') {
          noteMessageRef.current(message);
        }
      },
      onStateChange: setMidiState,
    });
    midiControllerRef.current = midiController;
    void midiController.initialize(midiInputId);

    return () => {
      midiController.disconnect();
      midiControllerRef.current = null;
    };
  }, [inputMode, midiInputId]);

  useEffect(() => {
    if (inputMode !== 'mic') {
      micControllerRef.current?.stop();
      micControllerRef.current = null;
      return;
    }

    const micController = new MicAccessController({
      onObservation: (observation) => micObservationRef.current(observation),
      onStateChange: setMicState,
    });
    micControllerRef.current = micController;

    void (async () => {
      if (micEnabled || (await microphonePermissionGranted())) {
        void micController.start();
      }
    })();

    return () => {
      micController.stop();
      micControllerRef.current = null;
    };
  }, [inputMode, micEnabled]);

  useEffect(() => {
    if (inputMode === 'mic') {
      return;
    }

    micCaptureRef.current.clear();
    micOverlapRef.current = { pitchClasses: [], expiresAt: 0 };
    syncVisibleMidiNotes();
  }, [inputMode, syncVisibleMidiNotes]);

  useEffect(() => {
    if (inputMode !== 'qwerty') {
      releaseAllQwertyNotes();
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTextInputTarget(event.target)) {
        return;
      }

      const controlAction = qwertyControlActionForKey(event.key);
      if (controlAction) {
        event.preventDefault();
        if (qwertyPressedNotesRef.current.size === 0) {
          setQwertyOctaveShift((current) => octaveShiftForAction(current, controlAction));
        }
        return;
      }

      const binding = qwertyBindingForKey(event.key);
      if (!binding) {
        return;
      }

      event.preventDefault();
      if (event.repeat || qwertyPressedNotesRef.current.has(binding.key)) {
        return;
      }

      const noteNumber = noteNumberForBinding(binding, qwertyOctaveShiftRef.current);
      qwertyPressedNotesRef.current.set(binding.key, noteNumber);
      noteMessageRef.current(createSyntheticNoteMessage('note_on', noteNumber, performance.now()));
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const binding = qwertyBindingForKey(event.key);
      if (!binding) {
        return;
      }

      const noteNumber = qwertyPressedNotesRef.current.get(binding.key);
      if (typeof noteNumber !== 'number') {
        return;
      }

      event.preventDefault();
      qwertyPressedNotesRef.current.delete(binding.key);
      noteMessageRef.current(createSyntheticNoteMessage('note_off', noteNumber, performance.now()));
    };

    const handleBlur = () => {
      releaseAllQwertyNotes();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        releaseAllQwertyNotes();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseAllQwertyNotes();
    };
  }, [inputMode, releaseAllQwertyNotes]);

  const handleTouchNoteOn = useCallback((midi: number, velocity: number) => {
    noteMessageRef.current(createSyntheticNoteMessage('note_on', midi, performance.now(), velocity));
  }, []);

  const handleTouchNoteOff = useCallback((midi: number) => {
    noteMessageRef.current(createSyntheticNoteMessage('note_off', midi, performance.now()));
  }, []);

  useEffect(() => {
    if (screen !== 'practice' || !phrase) {
      return;
    }

    const timer = window.setInterval(() => {
      const nowMs = performance.now();
      const submission = pendingAdvanceRef.current
        ? null
        : captureRef.current.flush(nowMs, currentRequiredPitchClasses());
      reconcileCarryoverDisplay();
      syncVisibleMidiNotes();

      if (suppressCarryoverDisplayRef.current) {
        return;
      }

      const didAdvance = commitPendingAdvanceIfReady(nowMs);
      if (pendingAdvanceRef.current) {
        return;
      }

      const readySubmission = didAdvance
        ? captureRef.current.flush(nowMs, currentRequiredPitchClasses())
        : submission;

      if (readySubmission) {
        submitAttempt(readySubmission.notes, readySubmission.timestamp, readySubmission.reason);
      }
    }, 40);

    return () => {
      window.clearInterval(timer);
    };
  }, [phrase, screen, commitPendingAdvanceIfReady, currentRequiredPitchClasses, reconcileCarryoverDisplay, submitAttempt, syncVisibleMidiNotes]);

  useEffect(() => {
    if (!playInputNotes) {
      previewRef.current.stopInputNotes();
    }
  }, [playInputNotes]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenEnabled) {
        return;
      }

      if (!document.fullscreenElement && progressRef.current.settings.immersiveMode) {
        const next: ProgressState = {
          ...progressRef.current,
          settings: {
            ...progressRef.current.settings,
            immersiveMode: false,
          },
        };
        commitProgress(next);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [commitProgress]);

  const playReference = useCallback(async () => {
    if (!phrase && !scalePrompt) {
      return;
    }

    const requestId = ++previewRequestIdRef.current;
    const shouldResumeMetronome = isRunningRef.current && progressRef.current.settings.metronomeEnabled;
    metronomeRef.current.stop();
    if (scalePrompt) {
      await previewRef.current.playScalePrompt(scalePrompt, {
        tempo: progressRef.current.settings.tempo,
      });
    } else if (phrase) {
      await previewRef.current.playPhrase(phrase, { withMetronome: true });
    }

    if (previewRequestIdRef.current !== requestId) {
      return;
    }

    if (shouldResumeMetronome) {
      await metronomeRef.current.start(progressRef.current.settings.tempo, {
        beatOffsetBeats: currentMetronomeBeatOffset(),
      });
    }
  }, [currentMetronomeBeatOffset, phrase, scalePrompt]);

  const toggleMetronome = useCallback(() => {
    const enabled = !progressRef.current.settings.metronomeEnabled;

    const next = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        metronomeEnabled: enabled,
      },
    };

    commitProgress(next);

    if (!enabled) {
      metronomeRef.current.stop();
      return;
    }

    if (isRunningRef.current) {
      void metronomeRef.current.start(next.settings.tempo, {
        beatOffsetBeats: currentMetronomeBeatOffset(),
      });
    }
  }, [commitProgress, currentMetronomeBeatOffset]);

  const toggleKeyboardVisible = useCallback(() => {
    const next = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        showKeyboardPanel: !progressRef.current.settings.showKeyboardPanel,
      },
    };
    commitProgress(next);
  }, [commitProgress]);

  const togglePracticeTrackingMode = useCallback(() => {
    const nextPracticeTrackingMode = progressRef.current.settings.practiceTrackingMode === 'test' ? 'play' : 'test';
    const next: ProgressState = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        practiceTrackingMode: nextPracticeTrackingMode,
        metronomeEnabled: nextPracticeTrackingMode === 'test'
          ? true
          : progressRef.current.settings.metronomeEnabled,
      },
    };

    commitProgress(next);
    if (nextPracticeTrackingMode === 'test' && isRunningRef.current) {
      void metronomeRef.current.start(next.settings.tempo, {
        beatOffsetBeats: currentMetronomeBeatOffset(),
      });
    }
  }, [commitProgress, currentMetronomeBeatOffset]);

  const togglePlayInputNotes = useCallback(() => {
    const next = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        playInputNotes: !progressRef.current.settings.playInputNotes,
      },
    };

    commitProgress(next);

    if (!next.settings.playInputNotes) {
      previewRef.current.stopInputNotes();
    }
  }, [commitProgress]);

  const selectInputMode = useCallback((mode: InputMode) => {
    if (progressRef.current.settings.inputMode === mode) {
      return;
    }

    commitProgress({
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        inputMode: mode,
      },
    });
  }, [commitProgress]);

  const enableMicrophone = useCallback(() => {
    setMicEnabled(true);
  }, []);

  const selectMidiInput = useCallback((inputId: string | null) => {
    commitProgress({
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        midiInputId: inputId,
      },
    });
  }, [commitProgress]);

  const toggleScaleGuideLabelMode = useCallback(() => {
    const nextScaleGuideLabelMode = progressRef.current.settings.scaleGuideLabelMode === 'degrees'
      ? 'note_names'
      : (progressRef.current.settings.scaleGuideLabelMode === 'note_names' ? 'hidden' : 'degrees');
    const next: ProgressState = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        scaleGuideLabelMode: nextScaleGuideLabelMode,
      },
    };

    commitProgress(next);
  }, [commitProgress]);

  const toggleCircleVisualizationMode = useCallback(() => {
    const nextCircleVisualizationMode = progressRef.current.settings.circleVisualizationMode === 'intervals'
      ? 'chord_arrows'
      : (progressRef.current.settings.circleVisualizationMode === 'chord_arrows' ? 'hidden' : 'intervals');
    const next: ProgressState = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        circleVisualizationMode: nextCircleVisualizationMode,
      },
    };

    commitProgress(next);
  }, [commitProgress]);

  const toggleImmersiveMode = useCallback(async () => {
    const nextImmersiveMode = !progressRef.current.settings.immersiveMode;
    const next: ProgressState = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        immersiveMode: nextImmersiveMode,
      },
    };

    commitProgress(next);

    if (nextImmersiveMode) {
      if (document.fullscreenEnabled && !document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          // Keep immersive layout active even if fullscreen is unavailable or blocked.
        }
      }
      return;
    }

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Layout mode is already turned off above.
      }
    }
  }, [commitProgress]);

  const setTempo = useCallback((inputTempo: number) => {
    const tempo = normalizeTempo(inputTempo);

    const next = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        tempo,
      },
    };

    commitProgress(next);

    setPhrase((previous) => {
      if (!previous) {
        return previous;
      }
      return {
        ...previous,
        tempo,
      };
    });

    if (isRunningRef.current && next.settings.metronomeEnabled) {
      metronomeRef.current.setTempo(tempo);
    }
  }, [commitProgress]);

  const commitExerciseConfig = useCallback((
    exerciseConfig: ProgressState['exerciseConfig'],
    options?: { resetVoicingSelection?: boolean; resetLocks?: boolean },
  ) => {
    const next = {
      ...progressRef.current,
      exerciseConfig: normalizeVoicingSelection(
        exerciseConfig,
        options?.resetVoicingSelection ?? false,
      ),
    };

    if (options?.resetLocks) {
      unlockSelectionLocks();
    }

    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase, unlockSelectionLocks]);

  const toggleClef = useCallback(() => {
    const nextClef: 'treble' | 'bass' = progressRef.current.settings.staffClef === 'bass' ? 'treble' : 'bass';
    const register = registerForClef(nextClef);
    const nextQwertyOctaveShift = defaultQwertyOctaveShiftForClef(nextClef);

    const next = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        staffClef: nextClef,
        registerMin: register.min,
        registerMax: register.max,
      },
    };

    if (progressRef.current.settings.inputMode === 'qwerty') {
      qwertyOctaveShiftRef.current = nextQwertyOctaveShift;
      setQwertyOctaveShift(nextQwertyOctaveShift);
    }

    commitProgress(next);
    metronomeRef.current.stop();
    setIsRunning(false);
    isRunningRef.current = false;
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const selectCurriculumPreset = useCallback((curriculumPresetId: ProgressState['exerciseConfig']['curriculumPresetId']) => {
    commitExerciseConfig(
      applyCurriculumPreset(progressRef.current.exerciseConfig, curriculumPresetId),
      { resetVoicingSelection: true, resetLocks: true },
    );
  }, [commitExerciseConfig]);

  const stepCurriculumPreset = useCallback((direction: 'forward' | 'backward') => {
    if (CURRICULUM_PRESETS.length <= 1) {
      return;
    }

    const currentIndex = CURRICULUM_PRESETS.findIndex(
      (preset) => preset.id === progressRef.current.exerciseConfig.curriculumPresetId,
    );
    const nextPreset = CURRICULUM_PRESETS[cycleIndex(CURRICULUM_PRESETS.length, currentIndex, direction)];
    if (!nextPreset) {
      return;
    }

    selectCurriculumPreset(nextPreset.id);
  }, [selectCurriculumPreset]);

  const selectKeySet = useCallback((keySet: ProgressState['exerciseConfig']['keySet']) => {
    commitExerciseConfig({
      ...progressRef.current.exerciseConfig,
      keySet,
      includedKeyRoots: rootsForKeySet(keySet),
    });
  }, [commitExerciseConfig]);

  const clearKeySet = useCallback(() => {
    commitExerciseConfig({
      ...progressRef.current.exerciseConfig,
      keySet: 'custom',
      includedKeyRoots: [],
    });
  }, [commitExerciseConfig]);

  const selectCurrentKey = useCallback((root: string) => {
    const currentPhrase = phraseRef.current;
    const currentConfig = progressRef.current.exerciseConfig;
    const scaleFallbackId = deriveScaleModeScaleIdsForContentBlocks(currentConfig.enabledContentBlockIds)[0] ?? null;
    const includedRoots = currentConfig.mode === 'scale'
      ? (() => {
        const scaleId = scalePrompt?.scaleId ?? scaleFallbackId;
        return scaleId
          ? resolveIncludedKeyRootsForScale(currentConfig.keySet, currentConfig.includedKeyRoots, scaleId)
          : resolveIncludedKeyRootsForLane(currentConfig.keySet, currentConfig.includedKeyRoots, currentConfig.lane);
      })()
      : resolveIncludedKeyRootsForLane(
        currentConfig.keySet,
        currentConfig.includedKeyRoots,
        currentPhrase?.lane ?? currentConfig.lane,
      );
    const alreadyIncluded = includedRoots.includes(root);
    const nextConfig: ProgressState['exerciseConfig'] = alreadyIncluded
      ? currentConfig
      : {
        ...currentConfig,
        keySet: 'custom',
        includedKeyRoots: normalizeIncludedKeyRoots([...includedRoots, root]),
      };
    const firstToken = currentPhrase?.events[0]
      ? currentPhrase.tokensById[currentPhrase.events[0].chordTokenId]
      : null;

    if (!alreadyIncluded) {
      commitProgress({
        ...progressRef.current,
        exerciseConfig: nextConfig,
      });
    }

    generateSelectedPhrase(nextConfig, {
      tonicOverride: root,
      progressionOverrideId: currentPhrase?.progressionId,
      voicingFamilyOverride: firstToken?.voicingFamily,
    });
  }, [commitProgress, generateSelectedPhrase, scalePrompt?.scaleId]);

  const selectMode = useCallback((mode: ProgressState['exerciseConfig']['mode']) => {
    const previousPracticeTrackingMode = progressRef.current.settings.practiceTrackingMode;
    const desiredPracticeTrackingMode = mode === 'improvisation' ? 'play' : 'test';
    const desiredScaleGuideLabelMode = mode === 'improvisation'
      ? 'degrees'
      : progressRef.current.settings.scaleGuideLabelMode;
    const nextExerciseConfig = normalizeVoicingSelection({
      ...progressRef.current.exerciseConfig,
      mode,
      selectedVoicings: mode === 'chord_flashcards'
        ? [...FLASHCARD_DEFAULT_VOICINGS]
        : progressRef.current.exerciseConfig.selectedVoicings,
      guidedFlowMode: mode === 'guided'
        ? 'targeting_improvement'
        : progressRef.current.exerciseConfig.guidedFlowMode,
      improvisationProgressionMode: mode === 'improvisation'
        ? 'chained'
        : progressRef.current.exerciseConfig.improvisationProgressionMode,
      flashcardFlowMode: mode === 'chord_flashcards'
        ? 'mixed_recall'
        : progressRef.current.exerciseConfig.flashcardFlowMode,
      scaleFlowMode: mode === 'scale'
        ? 'mixed_recall'
        : progressRef.current.exerciseConfig.scaleFlowMode,
    }, false);
    const next: ProgressState = {
      ...progressRef.current,
      exerciseConfig: nextExerciseConfig,
      settings: {
        ...progressRef.current.settings,
        practiceTrackingMode: desiredPracticeTrackingMode,
        scaleGuideLabelMode: desiredScaleGuideLabelMode,
        metronomeEnabled: mode === 'chord_flashcards' || mode === 'scale'
          ? false
          : (desiredPracticeTrackingMode === 'test'
            ? true
            : progressRef.current.settings.metronomeEnabled),
        showKeyboardPanel: mode === 'scale'
          ? false
          : progressRef.current.settings.showKeyboardPanel,
      },
    };

    setScalePromptOverrides({});
    unlockSelectionLocks();
    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);

    if (previousPracticeTrackingMode !== desiredPracticeTrackingMode) {
      setPracticeTrackingFlashToken((current) => current + 1);
    }

    if (desiredPracticeTrackingMode === 'test' && mode !== 'chord_flashcards' && mode !== 'scale' && isRunningRef.current) {
      void metronomeRef.current.start(next.settings.tempo, {
        beatOffsetBeats: currentMetronomeBeatOffset(),
      });
    }
  }, [commitProgress, currentMetronomeBeatOffset, generateNextPhrase, unlockSelectionLocks]);

  const stepExerciseMode = useCallback((direction: 'forward' | 'backward') => {
    const modes: ProgressState['exerciseConfig']['mode'][] = ['guided', 'improvisation', 'chord_flashcards', 'scale'];
    const currentIndex = modes.indexOf(progressRef.current.exerciseConfig.mode);
    const nextMode = modes[cycleIndex(modes.length, currentIndex, direction)];
    if (!nextMode) {
      return;
    }

    selectMode(nextMode);
  }, [selectMode]);

  useEffect(() => {
    const handleNavigationKeyStep = (event: KeyboardEvent) => {
      if (screen !== 'practice' || event.metaKey || event.ctrlKey || event.altKey || isTextInputTarget(event.target)) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (!event.repeat) {
          stepCurrentKey('counterclockwise');
        }
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (!event.repeat) {
          stepCurrentKey('clockwise');
        }
        return;
      }

      if (event.key === ',') {
        event.preventDefault();
        if (!event.repeat) {
          stepCurrentExercise('backward');
        }
        return;
      }

      if (event.key === '.') {
        event.preventDefault();
        if (!event.repeat) {
          stepCurrentExercise('forward');
        }
        return;
      }

      if (event.key === '_') {
        event.preventDefault();
        if (!event.repeat) {
          stepCurriculumPreset('backward');
        }
        return;
      }

      if (event.key === '+') {
        event.preventDefault();
        if (!event.repeat) {
          stepCurriculumPreset('forward');
        }
        return;
      }

      if (event.key === '-') {
        event.preventDefault();
        if (!event.repeat) {
          stepExerciseMode('backward');
        }
        return;
      }

      if (event.key === '=') {
        event.preventDefault();
        if (!event.repeat) {
          stepExerciseMode('forward');
        }
      }
    };

    window.addEventListener('keydown', handleNavigationKeyStep);
    return () => {
      window.removeEventListener('keydown', handleNavigationKeyStep);
    };
  }, [screen, stepCurriculumPreset, stepCurrentExercise, stepCurrentKey, stepExerciseMode]);

  const selectGuidedFlowMode = useCallback((guidedFlowMode: ProgressState['exerciseConfig']['guidedFlowMode']) => {
    commitExerciseConfig({
      ...progressRef.current.exerciseConfig,
      guidedFlowMode,
    });
  }, [commitExerciseConfig]);

  const selectRhythm = useCallback((rhythm: 'all' | typeof SPECIFIC_RHYTHM_IDS[number]) => {
    const nextRhythm = toggleRhythmSelection(progressRef.current.exerciseConfig.rhythm, rhythm);
    commitExerciseConfig({
      ...progressRef.current.exerciseConfig,
      rhythm: nextRhythm,
    }, { resetLocks: true });
  }, [commitExerciseConfig]);

  const selectImprovisationProgressionMode = useCallback((
    improvisationProgressionMode: ProgressState['exerciseConfig']['improvisationProgressionMode'],
  ) => {
    commitExerciseConfig({
      ...progressRef.current.exerciseConfig,
      improvisationProgressionMode,
    });
  }, [commitExerciseConfig]);

  const selectFlashcardFlowMode = useCallback((
    flashcardFlowMode: ProgressState['exerciseConfig']['flashcardFlowMode'],
  ) => {
    commitExerciseConfig({
      ...progressRef.current.exerciseConfig,
      flashcardFlowMode,
    });
  }, [commitExerciseConfig]);

  const selectScaleFlowMode = useCallback((
    scaleFlowMode: ProgressState['exerciseConfig']['scaleFlowMode'],
  ) => {
    commitExerciseConfig({
      ...progressRef.current.exerciseConfig,
      scaleFlowMode,
    });
  }, [commitExerciseConfig]);

  const selectImprovisationAdvanceMode = useCallback((
    improvisationAdvanceMode: ProgressState['exerciseConfig']['improvisationAdvanceMode'],
  ) => {
    commitExerciseConfig({
      ...progressRef.current.exerciseConfig,
      improvisationAdvanceMode,
    });
  }, [commitExerciseConfig]);

  const setChainMovement = useCallback((chainMovement: number) => {
    commitExerciseConfig({
      ...progressRef.current.exerciseConfig,
      chainMovement: Math.max(0, Math.min(100, Math.round(chainMovement))),
    });
  }, [commitExerciseConfig]);

  const toggleSelectedVoicing = useCallback((voicingFamily: VoicingFamily) => {
    const currentSelected = activeVoicingFamiliesForPractice(progressRef.current);
    const isSelected = currentSelected.includes(voicingFamily);
    const nextSelected = isSelected
      ? currentSelected.filter((voicing) => voicing !== voicingFamily)
      : orderedVoicingFamilies([...currentSelected, voicingFamily]);

    if (nextSelected.length === 0) {
      return;
    }

    commitExerciseConfig({
      ...progressRef.current.exerciseConfig,
      selectedVoicings: nextSelected,
    }, { resetLocks: true });
  }, [commitExerciseConfig]);

  const toggleCurriculumPreset = useCallback((curriculumPresetId: ProgressState['exerciseConfig']['curriculumPresetId']) => {
    const currentConfig = progressRef.current.exerciseConfig;
    const nextContentBlockIds = toggleCurriculumPresetContentBlocks(currentConfig, curriculumPresetId);
    const matchedPresetId = exactCurriculumPresetIdForContentBlocks(nextContentBlockIds);
    const derivedFamilies = deriveFamiliesForContentBlocks(nextContentBlockIds);
    const matchedPreset = matchedPresetId ? getCurriculumPreset(matchedPresetId) : null;

    commitExerciseConfig({
      ...currentConfig,
      curriculumPresetId: matchedPresetId ?? currentConfig.curriculumPresetId,
      enabledContentBlockIds: nextContentBlockIds,
      enabledScaleFamilyIds: matchedPreset
        ? [...matchedPreset.enabledScaleFamilyIds]
        : derivedFamilies.enabledScaleFamilyIds,
      enabledProgressionFamilyTags: matchedPreset
        ? [...matchedPreset.enabledProgressionFamilyTags]
        : derivedFamilies.enabledProgressionFamilyTags,
    }, { resetVoicingSelection: true, resetLocks: true });
  }, [commitExerciseConfig]);

  const toggleScaleFamily = useCallback((scaleFamilyId: ProgressState['exerciseConfig']['enabledScaleFamilyIds'][number]) => {
    const current = progressRef.current.exerciseConfig.enabledScaleFamilyIds;
    const nextIds = current.includes(scaleFamilyId)
      ? current.filter((id) => id !== scaleFamilyId)
      : [...current, scaleFamilyId];

    commitExerciseConfig({
      ...progressRef.current.exerciseConfig,
      enabledScaleFamilyIds: nextIds,
    }, { resetVoicingSelection: true, resetLocks: true });
  }, [commitExerciseConfig]);

  const toggleProgressionFamily = useCallback((progressionFamilyTag: ProgressState['exerciseConfig']['enabledProgressionFamilyTags'][number]) => {
    const current = progressRef.current.exerciseConfig.enabledProgressionFamilyTags;
    const nextIds = current.includes(progressionFamilyTag)
      ? current.filter((id) => id !== progressionFamilyTag)
      : [...current, progressionFamilyTag];

    commitExerciseConfig({
      ...progressRef.current.exerciseConfig,
      enabledProgressionFamilyTags: nextIds,
    }, { resetVoicingSelection: true, resetLocks: true });
  }, [commitExerciseConfig]);

  const keyboardTargetNotes = useMemo(() => {
    if (progress.exerciseConfig.mode !== 'improvisation' && keyboardTargetOverrideNotes) {
      return keyboardTargetOverrideNotes;
    }
    const event = phrase?.events[currentEventIndex];
    if (!phrase || !event) {
      return [];
    }
    const targetNotes = phrase.tokensById[event.chordTokenId]?.midiVoicing ?? [];
    if (progress.exerciseConfig.mode !== 'improvisation') {
      return targetNotes;
    }

    return targetNotes;
  }, [
    keyboardTargetOverrideNotes,
    phrase,
    currentEventIndex,
    progress.exerciseConfig.mode,
  ]);

  const improvisationOverlay = useMemo(
    () => improvisationOverlayForEvent(phrase, currentEventIndex),
    [phrase, currentEventIndex],
  );
  const flashcardAcceptedPitchClasses = useMemo(() => {
    if (progress.exerciseConfig.mode !== 'chord_flashcards') {
      return [];
    }

    return unique(acceptedFlashcardTokensForEvent(
      phrase,
      currentEventIndex,
      progress.exerciseConfig,
      progress.settings,
    ).flatMap((token) => [...token.requiredPitchClasses, ...token.optionalPitchClasses]));
  }, [currentEventIndex, phrase, progress.exerciseConfig, progress.settings]);
  const isFlashcardMode = progress.exerciseConfig.mode === 'chord_flashcards';
  const showFlashcardScaffolding = !isFlashcardMode || flashcardScaffoldingVisible;
  const notationVisible = showFlashcardScaffolding;
  const effectiveKeyboardVisible = isFlashcardMode
    ? showFlashcardScaffolding
    : progress.settings.showKeyboardPanel;

  const keyboardRange = useMemo(() => {
    return {
      min: 21,
      max: 108,
    };
  }, []);

  const allowedRoots = useMemo(() => {
    if (progress.exerciseConfig.mode === 'scale') {
      const fallbackScaleId = deriveScaleModeScaleIdsForContentBlocks(progress.exerciseConfig.enabledContentBlockIds)[0] ?? null;
      const scaleId = scalePrompt?.scaleId ?? fallbackScaleId;
      if (scaleId) {
        return resolveIncludedKeyRootsForScale(
          progress.exerciseConfig.keySet,
          progress.exerciseConfig.includedKeyRoots,
          scaleId,
        );
      }
    }

    return resolveIncludedKeyRootsForLane(
      progress.exerciseConfig.keySet,
      progress.exerciseConfig.includedKeyRoots,
      phrase?.lane ?? progress.exerciseConfig.lane,
    );
  }, [
    phrase?.lane,
    progress.exerciseConfig.enabledContentBlockIds,
    progress.exerciseConfig.includedKeyRoots,
    progress.exerciseConfig.keySet,
    progress.exerciseConfig.lane,
    progress.exerciseConfig.mode,
    scalePrompt?.scaleId,
  ]);
  const layoutOptionAvailability = useMemo(() => {
    const config = progress.exerciseConfig;
    const withConfig = (nextConfig: ProgressState['exerciseConfig']): boolean => countMatchingProgressions(nextConfig) > 0;

    return {
      presets: Object.fromEntries(CURRICULUM_PRESETS.map((preset) => [
        preset.id,
        withConfig({
          ...config,
          enabledContentBlockIds: toggleCurriculumPresetContentBlocks(config, preset.id),
        }),
      ])),
    };
  }, [progress.exerciseConfig]);
  const exactCurriculumPresetId = useMemo(
    () => exactCurriculumPresetIdForContentBlocks(progress.exerciseConfig.enabledContentBlockIds),
    [progress.exerciseConfig.enabledContentBlockIds],
  );
  const curriculumPickerItems = useMemo(() => CURRICULUM_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    selected: exactCurriculumPresetId === 'full_library'
      ? preset.id === 'full_library'
      : (preset.id !== 'full_library'
        && preset.enabledContentBlockIds.every((blockId) => progress.exerciseConfig.enabledContentBlockIds.includes(blockId))),
    disabled: !layoutOptionAvailability.presets[preset.id],
  })), [exactCurriculumPresetId, layoutOptionAvailability.presets, progress.exerciseConfig.enabledContentBlockIds]);
  const keySetPickerItems = useMemo(() => KEY_SET_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    description: option.description,
    selected: progress.exerciseConfig.keySet === option.id,
  })), [progress.exerciseConfig.keySet]);
  const currentScaleTonic = scalePrompt?.tonic ?? allowedRoots[0] ?? null;
  const scaleExercisePickerItems = useMemo<ExercisePickerItem[]>(() => {
    if (!currentScaleTonic) {
      return [];
    }

    const familyLabelById = new Map(SCALE_FAMILY_OPTIONS.map((family) => [family.id, family.label]));
    const scaleIds = [...new Set(
      listPlayableScaleTargets(progress.exerciseConfig)
        .filter((target) => target.tonic === currentScaleTonic)
        .map((target) => target.scaleId),
    )];

    return scaleIds.map((scaleId) => {
      const option = getScaleOption(scaleId);
      return {
        id: scaleId,
        label: option.label,
        subtitle: familyLabelById.get(option.familyId) ?? option.familyId,
        masteryLabel: 'New',
        detailLabel: `${currentScaleTonic} · ${progress.settings.staffClef === 'bass' ? 'LH' : 'RH'} · ${progress.exerciseConfig.scaleOctaveSpan} oct`,
        mastered: false,
      };
    });
  }, [currentScaleTonic, progress.exerciseConfig, progress.settings.staffClef]);
  const availableProgressionIds = useMemo(
    () => playableProgressionIds(progress.exerciseConfig, progress),
    [progress],
  );
  const hasCompatiblePracticeMaterial = progress.exerciseConfig.mode === 'scale'
    ? playableScaleTargetCount > 0
    : potentialProgressionCount > 0;
  const progressionExercisePickerItems = useMemo<ExercisePickerItem[]>(() => {
    const masteryById = new Map(
      buildProgressionMasterySummaries(progress).map((summary) => [summary.progression.id, summary]),
    );

    return availableProgressionIds.reduce<ExercisePickerItem[]>((items, progressionId) => {
      const summary = masteryById.get(progressionId);
      if (!summary) {
        return items;
      }

      items.push({
        id: summary.progression.id,
        label: summary.progression.steps.map((step) => step.roman).join('-'),
        subtitle: progressionSubtitle(summary.progression.id),
        masteryLabel: summary.attempts === 0 ? 'New' : pct(summary.recentAccuracy),
        detailLabel: summary.attempts === 0
          ? 'No reps yet'
          : `${summary.attempts} rep${summary.attempts === 1 ? '' : 's'} · ${Math.min(summary.attempts, MASTERY_MIN_ATTEMPTS)} recent`,
        mastered: summary.mastered,
      });

      return items;
    }, []);
  }, [availableProgressionIds, progress]);
  const exercisePickerItems = progress.exerciseConfig.mode === 'scale'
    ? scaleExercisePickerItems
    : progressionExercisePickerItems;

  if (screen === 'progress') {
    return (
      <ProgressScreen
          progress={progress}
          theme={theme}
        onBack={() => {
          setScreen('practice');
          setStreak(0);
          generateNextPhrase(progressRef.current);
        }}
        onToggleTheme={() => setTheme((currentTheme) => nextTheme(currentTheme))}
      />
    );
  }

  return (
    <>
        <PracticeLayout
        exerciseMode={progress.exerciseConfig.mode}
        curriculumLabel={activeCurriculumPreset?.label ?? 'Custom Curriculum'}
        practiceTrackingMode={progress.settings.practiceTrackingMode}
        practiceTrackingFlashToken={practiceTrackingFlashToken}
        phrase={phrase}
        scalePrompt={scalePrompt}
        hasCompatiblePhrases={hasCompatiblePracticeMaterial}
        clef={progress.settings.staffClef}
        currentEventIndex={currentEventIndex}
        completedEventIds={completedEventIds}
        completedScaleNoteIndices={completedScaleNoteIndices}
        currentScaleNoteIndex={currentScaleNoteIndex}
        theme={theme}
        activeNotes={keyboardActiveNotes}
        minMidi={keyboardRange.min}
        maxMidi={keyboardRange.max}
        streak={streak}
        deckMasteryPct={deckMasteryPct}
        latestEvaluation={latestEvaluation}
        midiState={midiState}
        micState={micState}
        inputMode={inputMode}
        onTouchNoteOn={inputMode === 'touch' ? handleTouchNoteOn : undefined}
        onTouchNoteOff={inputMode === 'touch' ? handleTouchNoteOff : undefined}
        canStepKey={allowedRoots.length > 1 && Boolean(progress.exerciseConfig.mode === 'scale' ? scalePrompt : phrase)}
        qwertyOctaveShift={qwertyOctaveShift}
        tempo={progress.settings.tempo}
        keyboardTargetNotes={keyboardTargetNotes}
        flashcardAcceptedPitchClasses={flashcardAcceptedPitchClasses}
        chordTonePitchClasses={improvisationOverlay.chordTonePitchClasses}
        currentScalePitchClasses={improvisationOverlay.currentScalePitchClasses}
        currentScaleGuideLabels={progress.settings.scaleGuideLabelMode === 'degrees'
          ? improvisationOverlay.currentScaleDegreeLabels
          : (progress.settings.scaleGuideLabelMode === 'note_names'
            ? improvisationOverlay.currentScaleNoteLabels
            : {})}
        nextScalePitchClasses={improvisationOverlay.nextScalePitchClasses}
        nextScaleGuideLabels={progress.settings.scaleGuideLabelMode === 'degrees'
          ? improvisationOverlay.nextScaleDegreeLabels
          : (progress.settings.scaleGuideLabelMode === 'note_names'
            ? improvisationOverlay.nextScaleNoteLabels
            : {})}
        scaleGuideLabelMode={progress.settings.scaleGuideLabelMode}
        circleVisualizationMode={progress.settings.circleVisualizationMode}
        immersiveMode={progress.settings.immersiveMode}
        notationVisible={notationVisible}
        showFlashcardScaffolding={showFlashcardScaffolding}
        keyboardVisible={effectiveKeyboardVisible}
        metronomeEnabled={progress.settings.metronomeEnabled}
        onTempoChange={setTempo}
        onToggleKeyboardVisible={toggleKeyboardVisible}
        onTogglePracticeTrackingMode={togglePracticeTrackingMode}
        onToggleScaleGuideLabelMode={toggleScaleGuideLabelMode}
        onToggleCircleVisualizationMode={toggleCircleVisualizationMode}
        onToggleImmersiveMode={toggleImmersiveMode}
        onToggleClef={toggleClef}
        canStepCurriculum={CURRICULUM_PRESETS.length > 1}
        onStepCurriculumBackward={() => stepCurriculumPreset('backward')}
        onStepCurriculumForward={() => stepCurriculumPreset('forward')}
        canStepMode={true}
        onStepModeBackward={() => stepExerciseMode('backward')}
        onStepModeForward={() => stepExerciseMode('forward')}
        canStepExercise={exercisePickerItems.length > 1 && Boolean(progress.exerciseConfig.mode === 'scale' ? scalePrompt : phrase)}
        exercisePickerItems={exercisePickerItems}
        currentKeySetLabel={KEY_SET_OPTIONS.find((option) => option.id === progress.exerciseConfig.keySet)?.label ?? 'Custom'}
        includedKeysLabel={formatIncludedKeysLabel(allowedRoots)}
        availableKeyRoots={allowedRoots}
        keySetPickerItems={keySetPickerItems}
        curriculumPickerItems={curriculumPickerItems}
        exerciseLocked={selectionLocks.exercise}
        keyLocked={selectionLocks.key}
        guidedFlowMode={progress.exerciseConfig.guidedFlowMode}
        improvisationProgressionMode={progress.exerciseConfig.improvisationProgressionMode}
        flashcardFlowMode={progress.exerciseConfig.flashcardFlowMode}
        scaleFlowMode={progress.exerciseConfig.scaleFlowMode}
        chainMovement={progress.exerciseConfig.chainMovement}
        onSelectExercise={selectCurrentExercise}
        onSelectCurrentKey={selectCurrentKey}
        onSelectKeySet={selectKeySet}
        onClearKeySet={clearKeySet}
        onToggleExerciseLock={() => toggleSelectionLock('exercise')}
        onToggleKeyLock={() => toggleSelectionLock('key')}
        onSelectMode={selectMode}
        onToggleCurriculumPreset={toggleCurriculumPreset}
        onSelectGuidedFlowMode={selectGuidedFlowMode}
        onSelectImprovisationProgressionMode={selectImprovisationProgressionMode}
        onSelectFlashcardFlowMode={selectFlashcardFlowMode}
        onSelectScaleFlowMode={selectScaleFlowMode}
        onSetChainMovement={setChainMovement}
        onStepExerciseBackward={() => stepCurrentExercise('backward')}
        onStepExerciseForward={() => stepCurrentExercise('forward')}
        onStepKeyBackward={() => stepCurrentKey('counterclockwise')}
        onStepKeyForward={() => stepCurrentKey('clockwise')}
        onToggleMetronome={toggleMetronome}
        onToggleTheme={() => setTheme((currentTheme) => nextTheme(currentTheme))}
        onPlayReference={playReference}
        onOpenSettings={() => setSettingsOpen(true)}
        walkthroughStep={walkthroughStep}
        onAdvanceWalkthrough={advanceWalkthrough}
        onDismissWalkthrough={dismissWalkthrough}
      />

      {settingsOpen ? (
        <PracticeSettingsDrawer
          progress={progress}
          inputMode={inputMode}
          midiState={midiState}
          micState={micState}
          potentialProgressionCount={potentialProgressionCount}
          potentialPhraseVariants={potentialPhraseVariants}
          authConfigured={isSupabaseConfigured()}
          authEmail={authEmail}
          authStatusText={authStatusText}
          cloudSyncState={cloudSyncState}
          onClose={() => setSettingsOpen(false)}
          onOpenProgress={() => {
            setSettingsOpen(false);
            setScreen('progress');
          }}
          onRequestEmailSignIn={requestEmailSignIn}
          onSignOut={signOut}
          onSyncNow={syncNow}
          onSelectRhythm={selectRhythm}
          onSelectImprovisationAdvanceMode={selectImprovisationAdvanceMode}
          onToggleSelectedVoicing={toggleSelectedVoicing}
          onToggleScaleFamily={toggleScaleFamily}
          onToggleProgressionFamily={toggleProgressionFamily}
          onSelectInputMode={selectInputMode}
          onSelectMidiInput={selectMidiInput}
          onEnableMicrophone={enableMicrophone}
          onTogglePlayInputNotes={togglePlayInputNotes}
        />
      ) : null}
    </>
  );
}
