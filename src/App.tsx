import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyCurriculumPreset,
  getCurriculumPreset,
} from './content/curriculum';
import { PracticeLayout } from './components/PracticeLayout';
import { PracticeSettingsDrawer } from './components/PracticeSettingsDrawer';
import { ProgressScreen } from './components/ProgressScreen';
import { Metronome } from './lib/audio/metronome';
import { PreviewPlayback } from './lib/audio/previewPlayback';
import { evaluateAttempt } from './lib/engine/evaluator';
import { evaluateImprovisationAttempt } from './lib/engine/improvisationEvaluator';
import { countMatchingProgressions, countPotentialStarterPhrases, generatePhrase } from './lib/engine/phraseGenerator';
import { applyMasteryUpdate } from './lib/engine/mastery';
import { applyUnlockDecision } from './lib/engine/unlocks';
import { createMidiFallbackState, MidiAccessController, type MidiConnectionState } from './lib/midi/midiAccess';
import { ChordCapture } from './lib/midi/chordCapture';
import type { ParsedMidiMessage } from './lib/midi/midiParser';
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
import { loadProgressState, pushAttempt, pushSession, saveProgressState } from './lib/storage/progressStore';
import { median } from './lib/theory/noteUtils';
import {
  degreeLabelsForScale,
  intersectPitchClasses,
  pitchClassesForScale,
  pitchClassesForScaleIds,
} from './lib/theory/scaleMap';
import { resolveRomanToChord } from './lib/theory/roman';
import type { EvaluationResult, Phrase } from './types/music';
import type { AttemptRecord, ProgressState } from './types/progress';

type Screen = 'practice' | 'progress';
type ThemeMode = 'light' | 'dark' | 'focus';
const CHORD_ADVANCE_TIMEOUT_MS = 1800;
const FOOTPEDAL_RELEASE_WINDOW_MS = 650;
const THEME_STORAGE_KEY = 'modal-muscle-memory-theme';

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

function registerForClef(clef: 'treble' | 'bass'): { min: number; max: number } {
  if (clef === 'bass') {
    return { min: 36, max: 60 };
  }
  return { min: 48, max: 72 };
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
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
  'quarters',
  'charleston',
  'anticipation_4and',
  'offbeat_1and_3',
  'syncopated_2and_4',
] as const;

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

export default function App() {
  const [screen, setScreen] = useState<Screen>('practice');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => loadInitialTheme());
  const [progress, setProgress] = useState<ProgressState>(() => loadProgressState());
  const progressRef = useRef<ProgressState>(progress);

  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const phraseRef = useRef<Phrase | null>(null);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const currentEventIndexRef = useRef(0);
  const [completedEventIds, setCompletedEventIds] = useState<Set<string>>(new Set());
  const [latestEvaluation, setLatestEvaluation] = useState<EvaluationResult | null>(null);

  const [midiNotes, setMidiNotes] = useState<Set<number>>(new Set());
  const [keyboardTargetOverrideNotes, setKeyboardTargetOverrideNotes] = useState<number[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = useRef(false);

  const [midiState, setMidiState] = useState<MidiConnectionState>(createMidiFallbackState());
  const [qwertyOctaveShift, setQwertyOctaveShift] = useState(() => defaultQwertyOctaveShiftForClef(progress.settings.staffClef));

  const metronomeRef = useRef<Metronome>(new Metronome());
  const previewRef = useRef<PreviewPlayback>(new PreviewPlayback());
  const captureRef = useRef<ChordCapture>(new ChordCapture({ simultaneityWindowMs: 90 }));
  const qwertyOctaveShiftRef = useRef(defaultQwertyOctaveShiftForClef(progress.settings.staffClef));
  const qwertyPressedNotesRef = useRef<Map<string, number>>(new Map());
  const autoDisabledKeyboardFriendlyRef = useRef(false);

  const phraseStartAtMsRef = useRef(0);
  const phraseStartedAtIsoRef = useRef<string | null>(null);
  const previousTokenIdRef = useRef<string | null>(null);
  const previousEventEndNotesRef = useRef<number[]>([]);
  const phraseAttemptHistoryRef = useRef<AttemptRecord[]>([]);
  const pendingAdvanceRef = useRef<PendingChordAdvance | null>(null);
  const carryoverNotesRef = useRef<Set<number>>(new Set());
  const suppressCarryoverDisplayRef = useRef(false);
  const previewRequestIdRef = useRef(0);

  const activeCurriculumPreset = useMemo(
    () => getCurriculumPreset(progress.exerciseConfig.curriculumPresetId),
    [progress.exerciseConfig.curriculumPresetId],
  );

  const matchingProgressionCount = useMemo(
    () => countMatchingProgressions(progress.exerciseConfig),
    [progress.exerciseConfig],
  );
  const potentialPhraseCount = useMemo(() => countPotentialStarterPhrases(progress), [progress]);
  const inputMode = midiState.ready ? 'midi' : 'qwerty';
  const computerKeyboardAudioEnabled = inputMode === 'qwerty' && progress.settings.enableComputerKeyboardAudio;
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
    progressRef.current = next;
    setProgress(next);
    saveProgressState(next);
  }, []);

  useEffect(() => {
    if (midiState.ready) {
      if (!progress.settings.keyboardFriendlyVoicings) {
        return;
      }

      autoDisabledKeyboardFriendlyRef.current = true;
      const next: ProgressState = {
        ...progressRef.current,
        settings: {
          ...progressRef.current.settings,
          keyboardFriendlyVoicings: false,
        },
      };
      commitProgress(next);
      return;
    }

    if (!autoDisabledKeyboardFriendlyRef.current || progress.settings.keyboardFriendlyVoicings) {
      return;
    }

    autoDisabledKeyboardFriendlyRef.current = false;
    const next: ProgressState = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        keyboardFriendlyVoicings: true,
      },
    };
    commitProgress(next);
  }, [commitProgress, midiState.ready, progress.settings.keyboardFriendlyVoicings]);

  useEffect(() => {
    if (midiState.ready || progress.exerciseConfig.improvisationAdvanceMode !== 'footpedal_release') {
      return;
    }

    const next: ProgressState = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        improvisationAdvanceMode: 'immediate',
      },
    };
    commitProgress(next);
  }, [commitProgress, midiState.ready, progress.exerciseConfig.improvisationAdvanceMode]);

  const updateCurrentEventIndex = useCallback((nextIndex: number) => {
    currentEventIndexRef.current = nextIndex;
    setCurrentEventIndex(nextIndex);
  }, []);

  const syncVisibleMidiNotes = useCallback(() => {
    setMidiNotes(new Set(captureRef.current.activeNoteNumbers));
  }, []);

  const generateNextPhrase = useCallback((state: ProgressState) => {
    if (countMatchingProgressions(state.exerciseConfig) === 0) {
      setPhrase(null);
      updateCurrentEventIndex(0);
      setCompletedEventIds(new Set());
      setLatestEvaluation(null);
      setKeyboardTargetOverrideNotes(null);
      setMidiNotes(new Set(captureRef.current.activeNoteNumbers));
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
    const useKeyboardFriendlyRange = !midiState.ready && state.settings.keyboardFriendlyVoicings;
    const nextPhrase = generatePhrase({
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
      )
        ? phraseRef.current
        : null,
    });

    setPhrase(nextPhrase);
    updateCurrentEventIndex(0);
    setCompletedEventIds(new Set());
    setLatestEvaluation(null);
    setMidiNotes(new Set(captureRef.current.activeNoteNumbers));
    setIsRunning(false);
    isRunningRef.current = false;

    phraseStartAtMsRef.current = 0;
    phraseStartedAtIsoRef.current = null;
    previousTokenIdRef.current = null;
    previousEventEndNotesRef.current = [];
    phraseAttemptHistoryRef.current = [];
    pendingAdvanceRef.current = null;
    captureRef.current.clearRecent();
  }, [midiState.ready, updateCurrentEventIndex]);

  useEffect(() => {
    if (!phrase && matchingProgressionCount > 0) {
      generateNextPhrase(progressRef.current);
    }
  }, [phrase, generateNextPhrase, matchingProgressionCount]);

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

      pendingAdvanceRef.current = null;
      previousEventEndNotesRef.current = [];
      captureRef.current.clearRecent();

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

    const stillHoldingAccepted = pending.acceptedNotes.some((note) =>
      captureRef.current.activeNoteNumbers.has(note),
    );

    const startedNewAttack = triggerMessage?.type === 'note_on'
      && !pending.acceptedNotes.includes(triggerMessage.noteNumber);
    const timeoutElapsed = (nowMs - pending.submittedAtMs) >= CHORD_ADVANCE_TIMEOUT_MS;

    if (stillHoldingAccepted && !startedNewAttack && !timeoutElapsed) {
      return false;
    }

    pendingAdvanceRef.current = null;
    previousEventEndNotesRef.current = [];
    captureRef.current.clearRecent();

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
    if (isImprovisationMode && submissionReason !== 'required_detected') {
      return;
    }

    if (!isRunningRef.current) {
      phraseStartAtMsRef.current = submittedAtMs;
      phraseStartedAtIsoRef.current = nowIso();
      setIsRunning(true);
      isRunningRef.current = true;
      if (progressRef.current.settings.metronomeEnabled) {
        void metronomeRef.current.start(workingPhrase.tempo);
      }
    }

    const msPerBeat = 60000 / workingPhrase.tempo;
    const expectedTimeMs = phraseStartAtMsRef.current + (((event.bar - 1) * 4) + (event.beat - 1)) * msPerBeat;

    const result = isImprovisationMode
      ? evaluateImprovisationAttempt({
        targetToken: token,
        playedNotes,
        allowedPitchClasses: improvisationOverlayForEvent(workingPhrase, eventIndex).allowedPitchClasses,
        expectedTimeMs,
        submittedAtMs,
        scoringMode: progressRef.current.settings.scoringMode,
      })
      : evaluateAttempt({
        targetToken: token,
        playedNotes,
        expectedTimeMs,
        submittedAtMs,
        scoringMode: progressRef.current.settings.scoringMode,
        previousEventEndNotes: previousEventEndNotesRef.current,
      });

    setLatestEvaluation(result);

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

    const hasBlockingPitchError = result.errors.some((error) =>
      ['missing_required_tone', 'outside_allowed_scale', 'wrong_target_notes'].includes(error.code),
    );

    if (hasBlockingPitchError) {
      setStreak(0);
      pendingAdvanceRef.current = null;
      return;
    }

    if (isImprovisationMode) {
      const isLastEvent = eventIndex >= workingPhrase.events.length - 1;
      if (progressRef.current.exerciseConfig.improvisationAdvanceMode === 'footpedal_release') {
        pendingAdvanceRef.current = {
          nextIndex: isLastEvent ? null : eventIndex + 1,
          acceptedNotes: [...token.midiVoicing],
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

      if (isLastEvent) {
        finishPhrase(nextProgress, workingPhrase);
        return;
      }

      updateCurrentEventIndex(eventIndex + 1);
      captureRef.current.clearRecent();
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
    previousEventEndNotesRef.current = playedNotes;

    const isLastEvent = eventIndex >= workingPhrase.events.length - 1;
    if (isLastEvent) {
      finishPhrase(nextProgress, workingPhrase);
      return;
    }

    pendingAdvanceRef.current = {
      nextIndex: eventIndex + 1,
      acceptedNotes: [...playedNotes],
      submittedAtMs,
    };
  }, [commitProgress, finishPhrase, practiceCountsTowardProgress, updateCurrentEventIndex]);

  const handleMidiMessage = useCallback((message: ParsedMidiMessage) => {
    const workingPhrase = phraseRef.current;
    const eventIndex = currentEventIndexRef.current;
    const targetEvent = workingPhrase ? workingPhrase.events[eventIndex] : null;
    const requiredPitchClasses = targetEvent
      ? workingPhrase?.tokensById[targetEvent.chordTokenId]?.requiredPitchClasses ?? []
      : [];

    const submission = captureRef.current.ingest(message, requiredPitchClasses);
    if (suppressCarryoverDisplayRef.current && message.type === 'note_off') {
      carryoverNotesRef.current.delete(message.noteNumber);
      if (carryoverNotesRef.current.size === 0) {
        suppressCarryoverDisplayRef.current = false;
        setKeyboardTargetOverrideNotes(null);
      }
    }
    syncVisibleMidiNotes();

    if (screen !== 'practice') {
      return;
    }

    if (suppressCarryoverDisplayRef.current) {
      return;
    }

    const nowMs = performance.now();
    const didAdvance = commitPendingAdvanceIfReady(nowMs, message);
    if (didAdvance || pendingAdvanceRef.current) {
      return;
    }

    if (submission) {
      submitAttempt(submission.notes, nowMs, submission.reason);
    }
  }, [screen, commitPendingAdvanceIfReady, submitAttempt, syncVisibleMidiNotes]);

  const releaseAllQwertyNotes = useCallback(() => {
    if (qwertyPressedNotesRef.current.size === 0) {
      return;
    }

    const now = performance.now();
    const activeNotes = [...qwertyPressedNotesRef.current.values()];
    qwertyPressedNotesRef.current.clear();
    activeNotes.forEach((noteNumber) => {
      previewRef.current.releaseInputNote(noteNumber);
      handleMidiMessage(createSyntheticNoteMessage('note_off', noteNumber, now));
    });
  }, [handleMidiMessage]);

  useEffect(() => {
    const midiController = new MidiAccessController({
      onMessage: handleMidiMessage,
      onStateChange: setMidiState,
    });

    midiController.initialize(progressRef.current.settings.midiInputId);

    return () => {
      midiController.disconnect();
    };
  }, [handleMidiMessage]);

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
      if (computerKeyboardAudioEnabled) {
        void previewRef.current.playInputNote(noteNumber);
      }
      handleMidiMessage(createSyntheticNoteMessage('note_on', noteNumber, performance.now()));
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
      previewRef.current.releaseInputNote(noteNumber);
      handleMidiMessage(createSyntheticNoteMessage('note_off', noteNumber, performance.now()));
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
  }, [computerKeyboardAudioEnabled, handleMidiMessage, inputMode, releaseAllQwertyNotes]);

  useEffect(() => {
    if (screen !== 'practice' || !phrase) {
      return;
    }

    const timer = window.setInterval(() => {
      const nowMs = performance.now();
      const workingPhrase = phraseRef.current;
      const eventIndex = currentEventIndexRef.current;
      const targetEvent = workingPhrase?.events[eventIndex] ?? null;
      const requiredPitchClasses = targetEvent
        ? workingPhrase?.tokensById[targetEvent.chordTokenId]?.requiredPitchClasses ?? []
        : [];

      const submission = captureRef.current.flush(nowMs, requiredPitchClasses);
      if (suppressCarryoverDisplayRef.current && carryoverNotesRef.current.size === 0) {
        suppressCarryoverDisplayRef.current = false;
        setKeyboardTargetOverrideNotes(null);
      }
      syncVisibleMidiNotes();

      if (suppressCarryoverDisplayRef.current) {
        return;
      }

      const didAdvance = commitPendingAdvanceIfReady(nowMs);
      if (didAdvance || pendingAdvanceRef.current) {
        return;
      }

      if (submission) {
        submitAttempt(submission.notes, nowMs, submission.reason);
      }
    }, 40);

    return () => {
      window.clearInterval(timer);
    };
  }, [phrase, screen, commitPendingAdvanceIfReady, submitAttempt, syncVisibleMidiNotes]);

  useEffect(() => {
    if (!computerKeyboardAudioEnabled) {
      previewRef.current.stopInputNotes();
    }
  }, [computerKeyboardAudioEnabled]);

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
    if (!phrase) {
      return;
    }

    const requestId = ++previewRequestIdRef.current;
    const shouldResumeMetronome = isRunningRef.current && progressRef.current.settings.metronomeEnabled;
    metronomeRef.current.stop();
    await previewRef.current.playPhrase(phrase, { withMetronome: true });

    if (previewRequestIdRef.current !== requestId) {
      return;
    }

    if (shouldResumeMetronome) {
      await metronomeRef.current.start(progressRef.current.settings.tempo);
    }
  }, [phrase]);

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
      void metronomeRef.current.start(next.settings.tempo);
    }
  }, [commitProgress]);

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
      void metronomeRef.current.start(next.settings.tempo);
    }
  }, [commitProgress]);

  const toggleComputerKeyboardAudio = useCallback(() => {
    const next = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        enableComputerKeyboardAudio: !progressRef.current.settings.enableComputerKeyboardAudio,
      },
    };

    commitProgress(next);

    if (!next.settings.enableComputerKeyboardAudio) {
      previewRef.current.stopInputNotes();
    }
  }, [commitProgress]);

  const toggleKeyboardFriendlyVoicings = useCallback(() => {
    autoDisabledKeyboardFriendlyRef.current = false;
    const next = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        keyboardFriendlyVoicings: !progressRef.current.settings.keyboardFriendlyVoicings,
      },
    };

    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const toggleScaleGuideLabelMode = useCallback(() => {
    const next: ProgressState = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        scaleGuideLabelMode: progressRef.current.settings.scaleGuideLabelMode === 'degrees'
          ? 'note_names'
          : 'degrees',
      },
    };

    commitProgress(next);
  }, [commitProgress]);

  const toggleCircleVisualizationMode = useCallback(() => {
    const next: ProgressState = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        circleVisualizationMode: progressRef.current.settings.circleVisualizationMode === 'intervals'
          ? 'chord_arrows'
          : 'intervals',
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

    if (!midiState.ready) {
      qwertyOctaveShiftRef.current = nextQwertyOctaveShift;
      setQwertyOctaveShift(nextQwertyOctaveShift);
    }

    commitProgress(next);
    metronomeRef.current.stop();
    setIsRunning(false);
    isRunningRef.current = false;
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase, midiState.ready]);

  const selectCurriculumPreset = useCallback((curriculumPresetId: ProgressState['exerciseConfig']['curriculumPresetId']) => {
    const next = {
      ...progressRef.current,
      exerciseConfig: applyCurriculumPreset(progressRef.current.exerciseConfig, curriculumPresetId),
    };
    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const selectKeySet = useCallback((keySet: ProgressState['exerciseConfig']['keySet']) => {
    const next = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        keySet,
      },
    };
    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const selectMode = useCallback((mode: ProgressState['exerciseConfig']['mode']) => {
    const next = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        mode,
        guidedFlowMode: mode === 'guided'
          ? 'targeting_improvement'
          : progressRef.current.exerciseConfig.guidedFlowMode,
        improvisationProgressionMode: mode === 'improvisation'
          ? 'chained'
          : progressRef.current.exerciseConfig.improvisationProgressionMode,
      },
    };

    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const selectGuidedFlowMode = useCallback((guidedFlowMode: ProgressState['exerciseConfig']['guidedFlowMode']) => {
    const next = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        guidedFlowMode,
      },
    };

    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const selectRhythm = useCallback((rhythm: 'all' | typeof SPECIFIC_RHYTHM_IDS[number]) => {
    const nextRhythm = toggleRhythmSelection(progressRef.current.exerciseConfig.rhythm, rhythm);
    const next = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        rhythm: nextRhythm,
      },
    };

    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const selectImprovisationProgressionMode = useCallback((
    improvisationProgressionMode: ProgressState['exerciseConfig']['improvisationProgressionMode'],
  ) => {
    const next = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        improvisationProgressionMode,
      },
    };

    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const selectImprovisationAdvanceMode = useCallback((
    improvisationAdvanceMode: ProgressState['exerciseConfig']['improvisationAdvanceMode'],
  ) => {
    const next = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        improvisationAdvanceMode,
      },
    };

    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const setChainMovement = useCallback((chainMovement: number) => {
    const next = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        chainMovement: Math.max(0, Math.min(100, Math.round(chainMovement))),
      },
    };

    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const toggleContentBlock = useCallback((contentBlockId: ProgressState['exerciseConfig']['enabledContentBlockIds'][number]) => {
    const current = progressRef.current.exerciseConfig.enabledContentBlockIds;
    const nextIds = current.includes(contentBlockId)
      ? current.filter((id) => id !== contentBlockId)
      : [...current, contentBlockId];

    const next = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        enabledContentBlockIds: nextIds,
      },
    };

    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const toggleScaleFamily = useCallback((scaleFamilyId: ProgressState['exerciseConfig']['enabledScaleFamilyIds'][number]) => {
    const current = progressRef.current.exerciseConfig.enabledScaleFamilyIds;
    const nextIds = current.includes(scaleFamilyId)
      ? current.filter((id) => id !== scaleFamilyId)
      : [...current, scaleFamilyId];

    const next = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        enabledScaleFamilyIds: nextIds,
      },
    };

    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const toggleProgressionFamily = useCallback((progressionFamilyTag: ProgressState['exerciseConfig']['enabledProgressionFamilyTags'][number]) => {
    const current = progressRef.current.exerciseConfig.enabledProgressionFamilyTags;
    const nextIds = current.includes(progressionFamilyTag)
      ? current.filter((id) => id !== progressionFamilyTag)
      : [...current, progressionFamilyTag];

    const next = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        enabledProgressionFamilyTags: nextIds,
      },
    };

    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

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

  const keyboardRange = useMemo(() => {
    if (progress.exerciseConfig.mode !== 'improvisation') {
      return {
        min: progress.settings.registerMin,
        max: progress.settings.registerMax,
      };
    }

    return {
      min: 21,
      max: 108,
    };
  }, [progress.exerciseConfig.mode, progress.settings.registerMax, progress.settings.registerMin]);

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
        phrase={phrase}
        clef={progress.settings.staffClef}
        currentEventIndex={currentEventIndex}
        completedEventIds={completedEventIds}
        theme={theme}
        activeNotes={midiNotes}
        minMidi={keyboardRange.min}
        maxMidi={keyboardRange.max}
        streak={streak}
        deckMasteryPct={deckMasteryPct}
        latestEvaluation={latestEvaluation}
        midiState={midiState}
        inputMode={inputMode}
        qwertyOctaveShift={qwertyOctaveShift}
        tempo={progress.settings.tempo}
        keyboardTargetNotes={keyboardTargetNotes}
        chordTonePitchClasses={improvisationOverlay.chordTonePitchClasses}
        currentScalePitchClasses={improvisationOverlay.currentScalePitchClasses}
        currentScaleGuideLabels={progress.settings.scaleGuideLabelMode === 'degrees'
          ? improvisationOverlay.currentScaleDegreeLabels
          : improvisationOverlay.currentScaleNoteLabels}
        nextScalePitchClasses={improvisationOverlay.nextScalePitchClasses}
        nextScaleGuideLabels={progress.settings.scaleGuideLabelMode === 'degrees'
          ? improvisationOverlay.nextScaleDegreeLabels
          : improvisationOverlay.nextScaleNoteLabels}
        scaleGuideLabelMode={progress.settings.scaleGuideLabelMode}
        circleVisualizationMode={progress.settings.circleVisualizationMode}
        immersiveMode={progress.settings.immersiveMode}
        keyboardVisible={progress.settings.showKeyboardPanel}
        metronomeEnabled={progress.settings.metronomeEnabled}
        onTempoChange={setTempo}
        onToggleKeyboardVisible={toggleKeyboardVisible}
        onTogglePracticeTrackingMode={togglePracticeTrackingMode}
        onToggleScaleGuideLabelMode={toggleScaleGuideLabelMode}
        onToggleCircleVisualizationMode={toggleCircleVisualizationMode}
        onToggleImmersiveMode={toggleImmersiveMode}
        onToggleClef={toggleClef}
        onToggleMetronome={toggleMetronome}
        onToggleTheme={() => setTheme((currentTheme) => nextTheme(currentTheme))}
        onPlayReference={playReference}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {settingsOpen ? (
        <PracticeSettingsDrawer
          progress={progress}
          inputMode={inputMode}
          potentialPhraseCount={potentialPhraseCount}
          onClose={() => setSettingsOpen(false)}
          onOpenProgress={() => {
            setSettingsOpen(false);
            setScreen('progress');
          }}
          onSelectMode={selectMode}
          onSelectGuidedFlowMode={selectGuidedFlowMode}
          onSelectCurriculumPreset={selectCurriculumPreset}
          onSelectKeySet={selectKeySet}
          onSelectRhythm={selectRhythm}
          onSelectImprovisationProgressionMode={selectImprovisationProgressionMode}
          onSelectImprovisationAdvanceMode={selectImprovisationAdvanceMode}
          onSetChainMovement={setChainMovement}
          onToggleContentBlock={toggleContentBlock}
          onToggleScaleFamily={toggleScaleFamily}
          onToggleProgressionFamily={toggleProgressionFamily}
          onToggleComputerKeyboardAudio={toggleComputerKeyboardAudio}
          onToggleKeyboardFriendlyVoicings={toggleKeyboardFriendlyVoicings}
        />
      ) : null}
    </>
  );
}
