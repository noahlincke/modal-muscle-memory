import {
  applyCurriculumPreset,
  curriculumPresetIdForLane,
  normalizeContentBlockIds,
  normalizeCurriculumPresetId,
  normalizeKeySetId,
  normalizeProgressionFamilyTags,
  normalizeScaleFamilyIds,
  resolveLaneFromCurriculumPresetId,
} from '../../content/curriculum';
import { normalizeIncludedKeyRoots, rootsForKeySet } from '../../content/keys';
import { getPackForLane } from '../../content/packs';
import type { ExerciseMode, ModeLane, RhythmCellId, RhythmSelection, VoicingFamily } from '../../types/music';
import type {
  AttemptRecord,
  ExerciseConfig,
  ProgressState,
  SessionRecord,
  UnlockState,
  UserSettings,
} from '../../types/progress';
import { registerForClef, type StaffClef } from '../theory/voicingPlacement';
import { orderedVoicingFamilies, VOICING_FAMILIES_IN_ORDER } from '../voicingFamilies';

const STORAGE_KEY = 'modal-muscle-memory-progress';
const SCHEMA_VERSION = 6;
const SESSION_MERGE_GAP_MS = 1000 * 60 * 12;
const RHYTHM_FILTER_IDS: Array<RhythmCellId | 'all'> = [
  'all',
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
];
const SPECIFIC_RHYTHM_IDS: RhythmCellId[] = RHYTHM_FILTER_IDS.filter((id): id is RhythmCellId => id !== 'all');
const VALID_VOICINGS = new Set<VoicingFamily>(VOICING_FAMILIES_IN_ORDER);

const ALL_LANES: ModeLane[] = [
  'ionian',
  'aeolian',
  'ionian_aeolian_mixture',
  'dorian',
  'mixolydian',
  'lydian',
  'phrygian',
];

function defaultExerciseConfig(): ExerciseConfig {
  return applyCurriculumPreset({
    mode: 'guided',
    curriculumPresetId: 'major_foundations',
    lane: 'ionian',
    enabledContentBlockIds: [],
    enabledScaleFamilyIds: [],
    enabledProgressionFamilyTags: [],
    keySet: 'max_2_accidentals',
    includedKeyRoots: rootsForKeySet('max_2_accidentals'),
    rhythm: ['block_whole', 'halves'],
    voicingPracticeMode: 'auto',
    selectedVoicings: [],
    guidedFlowMode: 'targeting_improvement',
    improvisationProgressionMode: 'chained',
    flashcardFlowMode: 'mixed_recall',
    improvisationAdvanceMode: 'immediate',
    chainMovement: 35,
  }, 'major_foundations');
}

function normalizeExerciseMode(value: unknown): ExerciseMode {
  if (value === 'improvisation' || value === 'chord_flashcards') {
    return value;
  }

  return 'guided';
}

function normalizeFlashcardFlowMode(value: unknown): ExerciseConfig['flashcardFlowMode'] {
  if (value === 'random' || value === 'targeting_improvement') {
    return value;
  }

  return 'mixed_recall';
}

function normalizeImprovisationAdvanceMode(value: unknown): ExerciseConfig['improvisationAdvanceMode'] {
  return value === 'footpedal_release' ? 'footpedal_release' : 'immediate';
}

function defaultRhythmSelection(): RhythmSelection {
  return [...defaultExerciseConfig().rhythm];
}

function normalizeRhythmSelection(value: unknown): RhythmSelection {
  if (!Array.isArray(value)) {
    return defaultRhythmSelection();
  }

  const valid = [...new Set(value.filter((item): item is RhythmCellId | 'all' => RHYTHM_FILTER_IDS.includes(item as RhythmCellId | 'all')))];
  if (valid.includes('all')) {
    return ['all'];
  }

  const specifics = valid.filter((item): item is RhythmCellId => item !== 'all');
  if (specifics.length === 0) {
    return defaultRhythmSelection();
  }

  if (SPECIFIC_RHYTHM_IDS.every((id) => specifics.includes(id))) {
    return ['all'];
  }

  return specifics;
}

function normalizeChainMovement(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultExerciseConfig().chainMovement;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeVoicingPracticeMode(value: unknown): ExerciseConfig['voicingPracticeMode'] {
  return value === 'custom' ? 'custom' : 'auto';
}

function normalizeSelectedVoicings(value: unknown): VoicingFamily[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return orderedVoicingFamilies(
    value.filter((item): item is VoicingFamily => VALID_VOICINGS.has(item as VoicingFamily)),
  );
}

function normalizeScaleGuideLabelMode(value: unknown): UserSettings['scaleGuideLabelMode'] {
  if (value === 'note_names' || value === 'hidden') {
    return value;
  }

  return 'degrees';
}

function normalizeCircleVisualizationMode(value: unknown): UserSettings['circleVisualizationMode'] {
  if (value === 'chord_arrows' || value === 'hidden') {
    return value;
  }

  return 'intervals';
}

function normalizeStaffClef(value: unknown): StaffClef {
  return value === 'bass' ? 'bass' : 'treble';
}

function defaultSettings(): UserSettings {
  const trebleRegister = registerForClef('treble');
  return {
    tempo: 78,
    metronomeEnabled: true,
    showKeyboardPanel: true,
    practiceTrackingMode: 'test',
    scaleGuideLabelMode: 'degrees',
    staffClef: 'treble',
    registerMin: trebleRegister.min,
    registerMax: trebleRegister.max,
    scoringMode: 'lenient',
    midiInputId: null,
    enableReferencePlayback: true,
    enableComputerKeyboardAudio: true,
    circleVisualizationMode: 'intervals',
    immersiveMode: false,
  };
}

function createUnlockState(
  lane: ModeLane,
  roots: string[],
  voicings: UnlockState['voicings'],
): UnlockState {
  const pack = getPackForLane(lane);
  return {
    roots,
    modes: [lane],
    voicings,
    rhythms: [...SPECIFIC_RHYTHM_IDS],
    borrowedDepth: lane === 'ionian_aeolian_mixture' ? 1 : 0,
    unlockedPackIds: pack ? [pack.id] : [],
  };
}

function defaultUnlocks(): Record<ModeLane, UnlockState> {
  return {
    ionian: createUnlockState('ionian', ['C'], ['guide_tone_37', 'guide_tone_73', 'shell_137', 'closed_7th']),
    aeolian: createUnlockState('aeolian', ['A'], ['shell_137', 'closed_7th']),
    ionian_aeolian_mixture: createUnlockState('ionian_aeolian_mixture', ['C'], ['shell_137']),
    dorian: createUnlockState('dorian', [], []),
    mixolydian: createUnlockState('mixolydian', [], []),
    lydian: createUnlockState('lydian', [], []),
    phrygian: createUnlockState('phrygian', [], []),
  };
}

export function createDefaultProgressState(): ProgressState {
  return {
    schemaVersion: SCHEMA_VERSION,
    exerciseConfig: defaultExerciseConfig(),
    settings: defaultSettings(),
    unlocksByLane: defaultUnlocks(),
    nodeMastery: {},
    edgeMastery: {},
    recentAttempts: [],
    sessionHistory: [],
    lastSessionAt: null,
  };
}

function mergeUnlockState(
  lane: ModeLane,
  incoming: Partial<UnlockState> | undefined,
): UnlockState {
  const fallback = defaultUnlocks()[lane];
  const pack = getPackForLane(lane);
  const packIds = new Set([...(incoming?.unlockedPackIds ?? []), ...(fallback.unlockedPackIds ?? [])]);
  const normalizedModes = [...new Set(
    [...fallback.modes, ...(incoming?.modes ?? [])].filter((mode): mode is ModeLane => ALL_LANES.includes(mode as ModeLane)),
  )];
  const normalizedVoicings = orderedVoicingFamilies(
    [...fallback.voicings, ...(incoming?.voicings ?? [])].filter((voicing): voicing is VoicingFamily => VALID_VOICINGS.has(voicing as VoicingFamily)),
  );
  const normalizedRhythms = [...new Set(
    [...fallback.rhythms, ...(incoming?.rhythms ?? [])].filter((rhythm): rhythm is RhythmCellId => SPECIFIC_RHYTHM_IDS.includes(rhythm as RhythmCellId)),
  )];
  if (pack) {
    packIds.add(pack.id);
  }

  return {
    roots: [...new Set([...fallback.roots, ...(incoming?.roots ?? [])].filter((root): root is string => typeof root === 'string' && root.length > 0))],
    modes: normalizedModes.length > 0 ? normalizedModes : fallback.modes,
    voicings: normalizedVoicings.length > 0 ? normalizedVoicings : fallback.voicings,
    rhythms: normalizedRhythms.length > 0 ? normalizedRhythms : fallback.rhythms,
    borrowedDepth: incoming?.borrowedDepth ?? fallback.borrowedDepth,
    unlockedPackIds: [...packIds],
  };
}

export function normalizeProgressState(raw: Partial<ProgressState>): ProgressState {
  const defaults = createDefaultProgressState();
  const inferredPresetId = raw.exerciseConfig?.curriculumPresetId
    ?? curriculumPresetIdForLane(raw.exerciseConfig?.lane ?? defaults.exerciseConfig.lane);
  const curriculumPresetId = normalizeCurriculumPresetId(inferredPresetId);
  const presetDefaults = applyCurriculumPreset(defaults.exerciseConfig, curriculumPresetId);
  const resolvedLane = resolveLaneFromCurriculumPresetId(curriculumPresetId);
  const keySet = normalizeKeySetId(raw.exerciseConfig?.keySet, presetDefaults.keySet);

  const unlocks = ALL_LANES.reduce<Record<ModeLane, UnlockState>>((acc, lane) => {
    acc[lane] = mergeUnlockState(lane, raw.unlocksByLane?.[lane]);
    return acc;
  }, {} as Record<ModeLane, UnlockState>);
  const rawSettingsSource = (raw.settings ?? {}) as Record<string, unknown>;
  const rawSettings = { ...rawSettingsSource };
  delete rawSettings.keyboardFriendlyVoicings;
  const staffClef = normalizeStaffClef(rawSettings.staffClef);
  const register = registerForClef(staffClef);

  return {
    schemaVersion: SCHEMA_VERSION,
    exerciseConfig: {
      ...presetDefaults,
      ...raw.exerciseConfig,
      mode: normalizeExerciseMode(raw.exerciseConfig?.mode),
      curriculumPresetId,
      lane: resolvedLane,
      enabledContentBlockIds: normalizeContentBlockIds(
        raw.exerciseConfig?.enabledContentBlockIds,
        presetDefaults.enabledContentBlockIds,
      ),
      enabledScaleFamilyIds: normalizeScaleFamilyIds(
        raw.exerciseConfig?.enabledScaleFamilyIds,
        presetDefaults.enabledScaleFamilyIds,
      ),
      enabledProgressionFamilyTags: normalizeProgressionFamilyTags(
        raw.exerciseConfig?.enabledProgressionFamilyTags,
        presetDefaults.enabledProgressionFamilyTags,
      ),
      keySet,
      includedKeyRoots: normalizeIncludedKeyRoots(
        raw.exerciseConfig?.includedKeyRoots,
        keySet === 'custom' ? [] : rootsForKeySet(keySet),
      ),
      rhythm: normalizeRhythmSelection(raw.exerciseConfig?.rhythm),
      voicingPracticeMode: normalizeVoicingPracticeMode(raw.exerciseConfig?.voicingPracticeMode),
      selectedVoicings: normalizeSelectedVoicings(raw.exerciseConfig?.selectedVoicings),
      guidedFlowMode: raw.exerciseConfig?.guidedFlowMode ?? presetDefaults.guidedFlowMode,
      improvisationProgressionMode:
        raw.exerciseConfig?.improvisationProgressionMode ?? presetDefaults.improvisationProgressionMode,
      flashcardFlowMode: normalizeFlashcardFlowMode(raw.exerciseConfig?.flashcardFlowMode),
      improvisationAdvanceMode: normalizeImprovisationAdvanceMode(raw.exerciseConfig?.improvisationAdvanceMode),
      chainMovement: normalizeChainMovement(raw.exerciseConfig?.chainMovement),
    },
    settings: {
      ...defaults.settings,
      ...rawSettings,
      staffClef,
      registerMin: register.min,
      registerMax: register.max,
      scaleGuideLabelMode: normalizeScaleGuideLabelMode(rawSettings.scaleGuideLabelMode),
      circleVisualizationMode: normalizeCircleVisualizationMode(rawSettings.circleVisualizationMode),
    },
    unlocksByLane: unlocks,
    nodeMastery: raw.nodeMastery ?? {},
    edgeMastery: raw.edgeMastery ?? {},
    recentAttempts: raw.recentAttempts?.slice(-300) ?? [],
    sessionHistory: raw.sessionHistory?.slice(-120) ?? [],
    lastSessionAt: raw.lastSessionAt ?? null,
  };
}

export function loadProgressState(): ProgressState {
  if (typeof window === 'undefined') {
    return createDefaultProgressState();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createDefaultProgressState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    return normalizeProgressState(parsed);
  } catch {
    return createDefaultProgressState();
  }
}

export function saveProgressState(progress: ProgressState): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeProgressState(progress)));
}

export function resetProgressState(): ProgressState {
  const next = createDefaultProgressState();
  saveProgressState(next);
  return next;
}

export function pushAttempt(
  progress: ProgressState,
  attempt: AttemptRecord,
): ProgressState {
  return {
    ...progress,
    recentAttempts: [...progress.recentAttempts, attempt].slice(-300),
    lastSessionAt: attempt.at,
  };
}

export function pushSession(
  progress: ProgressState,
  session: SessionRecord,
): ProgressState {
  const previousSession = progress.sessionHistory[progress.sessionHistory.length - 1];
  const canMerge = previousSession
    && previousSession.mode === session.mode
    && previousSession.curriculumPresetId === session.curriculumPresetId
    && (new Date(session.startedAt).getTime() - new Date(previousSession.endedAt).getTime()) <= SESSION_MERGE_GAP_MS;

  if (canMerge) {
    const previousPhraseCount = Math.max(1, previousSession.phraseIds.length);
    const nextPhraseCount = Math.max(1, session.phraseIds.length);
    const combinedPhraseCount = previousPhraseCount + nextPhraseCount;
    const combinedSession: SessionRecord = {
      ...previousSession,
      lane: session.lane,
      endedAt: session.endedAt,
      phraseIds: [...previousSession.phraseIds, ...session.phraseIds],
      accuracy: ((previousSession.accuracy * previousPhraseCount) + (session.accuracy * nextPhraseCount)) / combinedPhraseCount,
      medianTransitionLatencyMs:
        ((previousSession.medianTransitionLatencyMs * previousPhraseCount) + (session.medianTransitionLatencyMs * nextPhraseCount))
        / combinedPhraseCount,
    };

    return {
      ...progress,
      sessionHistory: [...progress.sessionHistory.slice(0, -1), combinedSession].slice(-120),
      lastSessionAt: combinedSession.endedAt,
    };
  }

  return {
    ...progress,
    sessionHistory: [...progress.sessionHistory, session].slice(-120),
    lastSessionAt: session.endedAt,
  };
}
