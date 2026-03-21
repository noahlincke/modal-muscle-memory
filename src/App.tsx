import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PracticeLayout } from './components/PracticeLayout';
import { PracticeSettingsDrawer } from './components/PracticeSettingsDrawer';
import { ProgressScreen } from './components/ProgressScreen';
import { Metronome } from './lib/audio/metronome';
import { PreviewPlayback } from './lib/audio/previewPlayback';
import { evaluateAttempt } from './lib/engine/evaluator';
import { evaluateImprovisationAttempt } from './lib/engine/improvisationEvaluator';
import { countPotentialStarterPhrases, generatePhrase } from './lib/engine/phraseGenerator';
import { applyMasteryUpdate } from './lib/engine/mastery';
import { applyUnlockDecision } from './lib/engine/unlocks';
import { createMidiFallbackState, MidiAccessController, type MidiConnectionState } from './lib/midi/midiAccess';
import { ChordCapture } from './lib/midi/chordCapture';
import type { ParsedMidiMessage } from './lib/midi/midiParser';
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
  releaseOnly?: boolean;
  completedProgress?: ProgressState;
  completedPhrase?: Phrase;
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
  const [completedEventIds, setCompletedEventIds] = useState<Set<string>>(new Set());
  const [latestEvaluation, setLatestEvaluation] = useState<EvaluationResult | null>(null);

  const [midiNotes, setMidiNotes] = useState<Set<number>>(new Set());
  const [keyboardTargetOverrideNotes, setKeyboardTargetOverrideNotes] = useState<number[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = useRef(false);

  const [midiState, setMidiState] = useState<MidiConnectionState>(createMidiFallbackState());

  const metronomeRef = useRef<Metronome>(new Metronome());
  const previewRef = useRef<PreviewPlayback>(new PreviewPlayback());
  const captureRef = useRef<ChordCapture>(new ChordCapture({ simultaneityWindowMs: 90 }));

  const phraseStartAtMsRef = useRef(0);
  const phraseStartedAtIsoRef = useRef<string | null>(null);
  const previousTokenIdRef = useRef<string | null>(null);
  const previousEventEndNotesRef = useRef<number[]>([]);
  const phraseAttemptHistoryRef = useRef<AttemptRecord[]>([]);
  const pendingAdvanceRef = useRef<PendingChordAdvance | null>(null);
  const carryoverNotesRef = useRef<Set<number>>(new Set());
  const suppressCarryoverDisplayRef = useRef(false);
  const previewRequestIdRef = useRef(0);

  const selectedLane = progress.exerciseConfig.lane;

  const potentialPhraseCount = useMemo(() => countPotentialStarterPhrases(progress), [progress]);

  const deckMasteryPct = useMemo(() => {
    const laneStats = Object.entries(progress.nodeMastery)
      .filter(([tokenId]) => tokenId.startsWith(`${selectedLane}:`))
      .map(([, stat]) => stat.accuracyEwma);

    if (laneStats.length === 0) {
      return 0;
    }

    const average = laneStats.reduce((sum, value) => sum + value, 0) / laneStats.length;
    return average * 100;
  }, [progress.nodeMastery, selectedLane]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    phraseRef.current = phrase;
  }, [phrase]);

  useEffect(() => () => {
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

  const commitProgress = useCallback((next: ProgressState) => {
    progressRef.current = next;
    setProgress(next);
    saveProgressState(next);
  }, []);

  const syncVisibleMidiNotes = useCallback(() => {
    setMidiNotes(new Set(captureRef.current.activeNoteNumbers));
  }, []);

  const generateNextPhrase = useCallback((state: ProgressState) => {
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
    const nextPhrase = generatePhrase({
      config: state.exerciseConfig,
      progress: state,
      tempo: state.settings.tempo,
      previousPhrase: state.exerciseConfig.mode === 'improvisation'
        && state.exerciseConfig.improvisationProgressionMode === 'chained'
        ? phraseRef.current
        : null,
    });

    setPhrase(nextPhrase);
    setCurrentEventIndex(0);
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
  }, []);

  useEffect(() => {
    if (!phrase) {
      generateNextPhrase(progressRef.current);
    }
  }, [phrase, generateNextPhrase]);

  const finishPhrase = useCallback((workingProgress: ProgressState, targetPhrase: Phrase) => {
    const attempts = phraseAttemptHistoryRef.current;
    const successes = attempts.filter((attempt) => attempt.success).length;
    const accuracy = attempts.length > 0 ? successes / attempts.length : 0;
    const medianTransitionLatencyMs = median(attempts.map((attempt) => attempt.latencyMs));

    let next = pushSession(workingProgress, {
      id: makeSessionId(),
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

    const stillHoldingAccepted = pending.acceptedNotes.some((note) =>
      captureRef.current.activeNoteNumbers.has(note),
    );

    if (pending.releaseOnly) {
      if (stillHoldingAccepted) {
        return false;
      }

      pendingAdvanceRef.current = null;
      previousEventEndNotesRef.current = [];
      captureRef.current.clearRecent();

      if (pending.completedProgress && pending.completedPhrase) {
        finishPhrase(pending.completedProgress, pending.completedPhrase);
        return true;
      }

      if (pending.nextIndex !== null) {
        setCurrentEventIndex(pending.nextIndex);
      }
      return true;
    }

    const startedNewAttack = triggerMessage?.type === 'note_on'
      && !pending.acceptedNotes.includes(triggerMessage.noteNumber);
    const timeoutElapsed = (nowMs - pending.submittedAtMs) >= CHORD_ADVANCE_TIMEOUT_MS;

    if (stillHoldingAccepted && !startedNewAttack && !timeoutElapsed) {
      return false;
    }

    pendingAdvanceRef.current = null;
    previousEventEndNotesRef.current = [];
    captureRef.current.clearRecent();
    if (pending.nextIndex !== null) {
      setCurrentEventIndex(pending.nextIndex);
    }
    return true;
  }, [finishPhrase]);

  const submitAttempt = useCallback((
    playedNotes: number[],
    submittedAtMs: number,
    submissionReason: 'required_detected' | 'burst_closed',
  ) => {
    const workingPhrase = phrase;
    if (!workingPhrase) {
      return;
    }

    const event = workingPhrase.events[currentEventIndex];
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
        allowedPitchClasses: improvisationOverlayForEvent(workingPhrase, currentEventIndex).allowedPitchClasses,
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

    let nextProgress = applyMasteryUpdate(
      progressRef.current,
      token.id,
      result,
      nowIso(),
      previousTokenIdRef.current,
    );

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

    nextProgress = pushAttempt(nextProgress, attemptRecord);
    commitProgress(nextProgress);

    phraseAttemptHistoryRef.current = [...phraseAttemptHistoryRef.current, attemptRecord];

    const hasBlockingPitchError = result.errors.some((error) =>
      ['missing_required_tone', 'outside_allowed_scale', 'wrong_target_notes'].includes(error.code),
    );

    if (hasBlockingPitchError) {
      setStreak(0);
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
    previousEventEndNotesRef.current = isImprovisationMode ? [] : playedNotes;

    const isLastEvent = currentEventIndex >= workingPhrase.events.length - 1;
    if (isLastEvent) {
      if (isImprovisationMode && result.success) {
        pendingAdvanceRef.current = {
          nextIndex: null,
          acceptedNotes: [...token.midiVoicing],
          submittedAtMs,
          releaseOnly: true,
          completedProgress: nextProgress,
          completedPhrase: workingPhrase,
        };
        return;
      }

      finishPhrase(nextProgress, workingPhrase);
      return;
    }

    if (isImprovisationMode) {
      pendingAdvanceRef.current = {
        nextIndex: currentEventIndex + 1,
        acceptedNotes: [...token.midiVoicing],
        submittedAtMs,
        releaseOnly: true,
      };
      captureRef.current.clearRecent();
      return;
    }

    pendingAdvanceRef.current = {
      nextIndex: currentEventIndex + 1,
      acceptedNotes: [...playedNotes],
      submittedAtMs,
    };
  }, [commitProgress, currentEventIndex, finishPhrase, phrase]);

  const handleMidiMessage = useCallback((message: ParsedMidiMessage) => {
    const targetEvent = phrase ? phrase.events[currentEventIndex] : null;
    const requiredPitchClasses = targetEvent
      ? phrase?.tokensById[targetEvent.chordTokenId]?.requiredPitchClasses ?? []
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
  }, [phrase, currentEventIndex, screen, commitPendingAdvanceIfReady, submitAttempt, syncVisibleMidiNotes]);

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
    if (screen !== 'practice' || !phrase) {
      return;
    }

    const timer = window.setInterval(() => {
      const nowMs = performance.now();
      const targetEvent = phrase.events[currentEventIndex] ?? null;
      const requiredPitchClasses = targetEvent
        ? phrase.tokensById[targetEvent.chordTokenId]?.requiredPitchClasses ?? []
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
  }, [currentEventIndex, phrase, screen, commitPendingAdvanceIfReady, submitAttempt, syncVisibleMidiNotes]);

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

    const next = {
      ...progressRef.current,
      settings: {
        ...progressRef.current.settings,
        staffClef: nextClef,
        registerMin: register.min,
        registerMax: register.max,
      },
    };

    commitProgress(next);
    metronomeRef.current.stop();
    setIsRunning(false);
    isRunningRef.current = false;
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const selectLane = useCallback((lane: ProgressState['exerciseConfig']['lane']) => {
    const next = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        lane,
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
      },
    };

    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const selectRhythm = useCallback((rhythm: ProgressState['exerciseConfig']['rhythm']) => {
    const next = {
      ...progressRef.current,
      exerciseConfig: {
        ...progressRef.current.exerciseConfig,
        rhythm,
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
        lane={selectedLane}
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
        keyboardVisible={progress.settings.showKeyboardPanel}
        metronomeEnabled={progress.settings.metronomeEnabled}
        onTempoChange={setTempo}
        onToggleKeyboardVisible={toggleKeyboardVisible}
        onToggleScaleGuideLabelMode={toggleScaleGuideLabelMode}
        onToggleClef={toggleClef}
        onToggleMetronome={toggleMetronome}
        onToggleTheme={() => setTheme((currentTheme) => nextTheme(currentTheme))}
        onPlayReference={playReference}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {settingsOpen ? (
        <PracticeSettingsDrawer
          progress={progress}
          potentialPhraseCount={potentialPhraseCount}
          onClose={() => setSettingsOpen(false)}
          onOpenProgress={() => {
            setSettingsOpen(false);
            setScreen('progress');
          }}
          onSelectMode={selectMode}
          onSelectLane={selectLane}
          onSelectRhythm={selectRhythm}
          onSelectImprovisationProgressionMode={selectImprovisationProgressionMode}
          onSetChainMovement={setChainMovement}
        />
      ) : null}
    </>
  );
}
