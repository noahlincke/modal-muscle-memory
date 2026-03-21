import { getPackForLane } from '../../content/packs';
import type { ModeLane } from '../../types/music';
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
  return {
    mode: 'guided',
    lane: 'ionian',
    rhythm: 'all',
    improvisationProgressionMode: 'random',
    chainMovement: 35,
  };
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
    scaleGuideLabelMode: 'degrees',
    staffClef: 'treble',
    registerMin: 48,
    registerMax: 72,
    scoringMode: 'lenient',
    midiInputId: null,
    enableReferencePlayback: true,
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

  const unlocks = ALL_LANES.reduce<Record<ModeLane, UnlockState>>((acc, lane) => {
    acc[lane] = mergeUnlockState(lane, raw.unlocksByLane?.[lane]);
    return acc;
  }, {} as Record<ModeLane, UnlockState>);

  return {
    schemaVersion: SCHEMA_VERSION,
    exerciseConfig: {
      ...defaults.exerciseConfig,
      ...raw.exerciseConfig,
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
  return {
    ...progress,
    sessionHistory: [...progress.sessionHistory, session].slice(-120),
    lastSessionAt: session.endedAt,
  };
}
