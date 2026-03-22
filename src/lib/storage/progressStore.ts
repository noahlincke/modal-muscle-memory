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
import { getPackForLane } from '../../content/packs';
import type { ModeLane, RhythmCellId, RhythmSelection } from '../../types/music';
import type {
  AttemptRecord,
  ExerciseConfig,
  ProgressState,
  SessionRecord,
  UnlockState,
  UserSettings,
} from '../../types/progress';

const STORAGE_KEY = 'modal-muscle-memory-progress';
const SCHEMA_VERSION = 3;
const SESSION_MERGE_GAP_MS = 1000 * 60 * 12;
const RHYTHM_FILTER_IDS: Array<RhythmCellId | 'all'> = [
  'all',
  'block_whole',
  'quarters',
  'charleston',
  'anticipation_4and',
  'offbeat_1and_3',
  'syncopated_2and_4',
];
const SPECIFIC_RHYTHM_IDS: RhythmCellId[] = RHYTHM_FILTER_IDS.filter((id): id is RhythmCellId => id !== 'all');

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
    rhythm: ['all'],
    guidedFlowMode: 'targeting_improvement',
    improvisationProgressionMode: 'chained',
    improvisationAdvanceMode: 'immediate',
    chainMovement: 35,
  }, 'major_foundations');
}

function normalizeImprovisationAdvanceMode(value: unknown): ExerciseConfig['improvisationAdvanceMode'] {
  return value === 'footpedal_release' ? 'footpedal_release' : 'immediate';
}

function normalizeRhythmSelection(value: unknown): RhythmSelection {
  if (!Array.isArray(value)) {
    return ['all'];
  }

  const valid = [...new Set(value.filter((item): item is RhythmCellId | 'all' => RHYTHM_FILTER_IDS.includes(item as RhythmCellId | 'all')))];
  if (valid.includes('all')) {
    return ['all'];
  }

  const specifics = valid.filter((item): item is RhythmCellId => item !== 'all');
  if (specifics.length === 0) {
    return ['all'];
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

function defaultSettings(): UserSettings {
  return {
    tempo: 78,
    metronomeEnabled: true,
    showKeyboardPanel: true,
    practiceTrackingMode: 'test',
    scaleGuideLabelMode: 'degrees',
    staffClef: 'treble',
    registerMin: 48,
    registerMax: 72,
    scoringMode: 'lenient',
    midiInputId: null,
    enableReferencePlayback: true,
    enableComputerKeyboardAudio: true,
    keyboardFriendlyVoicings: true,
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
    rhythms: ['block_whole', 'quarters', 'charleston'],
    borrowedDepth: lane === 'ionian_aeolian_mixture' ? 1 : 0,
    unlockedPackIds: pack ? [pack.id] : [],
  };
}

function defaultUnlocks(): Record<ModeLane, UnlockState> {
  return {
    ionian: createUnlockState('ionian', ['C'], ['shell_137', 'closed_7th']),
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
  if (pack) {
    packIds.add(pack.id);
  }

  return {
    roots: [...new Set(incoming?.roots ?? fallback.roots)],
    modes: incoming?.modes?.length ? incoming.modes : fallback.modes,
    voicings: [...new Set(incoming?.voicings ?? fallback.voicings)],
    rhythms: [...new Set(incoming?.rhythms ?? fallback.rhythms)],
    borrowedDepth: incoming?.borrowedDepth ?? fallback.borrowedDepth,
    unlockedPackIds: [...packIds],
  };
}

function mergeProgress(raw: Partial<ProgressState>): ProgressState {
  const defaults = createDefaultProgressState();
  const inferredPresetId = raw.exerciseConfig?.curriculumPresetId
    ?? curriculumPresetIdForLane(raw.exerciseConfig?.lane ?? defaults.exerciseConfig.lane);
  const curriculumPresetId = normalizeCurriculumPresetId(inferredPresetId);
  const presetDefaults = applyCurriculumPreset(defaults.exerciseConfig, curriculumPresetId);
  const resolvedLane = resolveLaneFromCurriculumPresetId(curriculumPresetId);

  const unlocks = ALL_LANES.reduce<Record<ModeLane, UnlockState>>((acc, lane) => {
    acc[lane] = mergeUnlockState(lane, raw.unlocksByLane?.[lane]);
    return acc;
  }, {} as Record<ModeLane, UnlockState>);

  return {
    schemaVersion: SCHEMA_VERSION,
    exerciseConfig: {
      ...presetDefaults,
      ...raw.exerciseConfig,
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
      keySet: normalizeKeySetId(raw.exerciseConfig?.keySet, presetDefaults.keySet),
      rhythm: normalizeRhythmSelection(raw.exerciseConfig?.rhythm),
      guidedFlowMode: raw.exerciseConfig?.guidedFlowMode ?? presetDefaults.guidedFlowMode,
      improvisationAdvanceMode: normalizeImprovisationAdvanceMode(raw.exerciseConfig?.improvisationAdvanceMode),
      chainMovement: normalizeChainMovement(raw.exerciseConfig?.chainMovement),
    },
    settings: {
      ...defaults.settings,
      ...raw.settings,
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
    return mergeProgress(parsed);
  } catch {
    return createDefaultProgressState();
  }
}

export function saveProgressState(progress: ProgressState): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mergeProgress(progress)));
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
