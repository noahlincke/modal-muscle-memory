import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HomeScreen } from './components/HomeScreen';
import { PracticeLayout } from './components/PracticeLayout';
import { ProgressScreen } from './components/ProgressScreen';
import { Metronome } from './lib/audio/metronome';
import { PreviewPlayback } from './lib/audio/previewPlayback';
import { evaluateAttempt } from './lib/engine/evaluator';
import { countPotentialStarterPhrases, generatePhrase } from './lib/engine/phraseGenerator';
import { applyMasteryUpdate } from './lib/engine/mastery';
import { applyUnlockDecision } from './lib/engine/unlocks';
import { MidiAccessController, type MidiConnectionState } from './lib/midi/midiAccess';
import { ChordCapture } from './lib/midi/chordCapture';
import type { ParsedMidiMessage } from './lib/midi/midiParser';
import { loadProgressState, pushAttempt, pushSession, saveProgressState } from './lib/storage/progressStore';
import { median } from './lib/theory/noteUtils';
import type { EvaluationResult, Phrase } from './types/music';
import type { AttemptRecord, ProgressState } from './types/progress';

type Screen = 'home' | 'practice' | 'progress';
const CHORD_ADVANCE_TIMEOUT_MS = 1800;

interface PendingChordAdvance {
  nextIndex: number;
  acceptedNotes: number[];
  submittedAtMs: number;
}

function createMidiFallbackState(): MidiConnectionState {
  return {
    supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
    ready: false,
    inputs: [],
    activeInputId: null,
    error: null,
  };
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

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [progress, setProgress] = useState<ProgressState>(() => loadProgressState());
  const progressRef = useRef<ProgressState>(progress);

  const [phrase, setPhrase] = useState<Phrase | null>(null);
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

  const selectedLane = progress.selectedLane;

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
    isRunningRef.current = isRunning;
  }, [isRunning]);

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
      lane: state.selectedLane,
      progress: state,
      tempo: state.settings.tempo,
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
    const startedNewAttack = triggerMessage?.type === 'note_on'
      && !pending.acceptedNotes.includes(triggerMessage.noteNumber);
    const timeoutElapsed = (nowMs - pending.submittedAtMs) >= CHORD_ADVANCE_TIMEOUT_MS;

    if (stillHoldingAccepted && !startedNewAttack && !timeoutElapsed) {
      return false;
    }

    pendingAdvanceRef.current = null;
    previousEventEndNotesRef.current = [];
    captureRef.current.clearRecent();
    setCurrentEventIndex(pending.nextIndex);
    return true;
  }, []);

  const submitAttempt = useCallback((playedNotes: number[], submittedAtMs: number) => {
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

    const result = evaluateAttempt({
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

    const hasBlockingPitchError = result.errors.some((error) => error.code === 'missing_required_tone');

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
    previousEventEndNotesRef.current = playedNotes;

    const isLastEvent = currentEventIndex >= workingPhrase.events.length - 1;
    if (isLastEvent) {
      finishPhrase(nextProgress, workingPhrase);
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
      submitAttempt(submission.notes, nowMs);
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
        submitAttempt(submission.notes, nowMs);
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

    const shouldResumeMetronome = isRunningRef.current && progressRef.current.settings.metronomeEnabled;
    metronomeRef.current.stop();
    await previewRef.current.playPhrase(phrase, { withMetronome: true });

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

  const selectLane = useCallback((lane: ProgressState['selectedLane']) => {
    const next = {
      ...progressRef.current,
      selectedLane: lane,
    };
    commitProgress(next);
    setStreak(0);
    generateNextPhrase(next);
  }, [commitProgress, generateNextPhrase]);

  const openPractice = useCallback(() => {
    setScreen('practice');
    if (!phrase) {
      generateNextPhrase(progressRef.current);
    }
  }, [generateNextPhrase, phrase]);

  const goHome = useCallback(() => {
    metronomeRef.current.stop();
    setIsRunning(false);
    isRunningRef.current = false;
    carryoverNotesRef.current = new Set();
    suppressCarryoverDisplayRef.current = false;
    setKeyboardTargetOverrideNotes(null);
    pendingAdvanceRef.current = null;
    setScreen('home');
  }, []);

  const keyboardTargetNotes = useMemo(() => {
    if (keyboardTargetOverrideNotes) {
      return keyboardTargetOverrideNotes;
    }
    const event = phrase?.events[currentEventIndex];
    if (!phrase || !event) {
      return [];
    }
    return phrase.tokensById[event.chordTokenId]?.midiVoicing ?? [];
  }, [keyboardTargetOverrideNotes, phrase, currentEventIndex]);

  if (screen === 'progress') {
    return <ProgressScreen progress={progress} onBack={() => setScreen('home')} />;
  }

  if (screen === 'practice') {
    return (
      <PracticeLayout
        lane={selectedLane}
        phrase={phrase}
        clef={progress.settings.staffClef}
        currentEventIndex={currentEventIndex}
        completedEventIds={completedEventIds}
        activeNotes={midiNotes}
        minMidi={progress.settings.registerMin}
        maxMidi={progress.settings.registerMax}
        streak={streak}
        deckMasteryPct={deckMasteryPct}
        latestEvaluation={latestEvaluation}
        midiState={midiState}
        tempo={progress.settings.tempo}
        keyboardTargetNotes={keyboardTargetNotes}
        keyboardVisible={progress.settings.showKeyboardPanel}
        metronomeEnabled={progress.settings.metronomeEnabled}
        onTempoChange={setTempo}
        onToggleKeyboardVisible={toggleKeyboardVisible}
        onToggleClef={toggleClef}
        onToggleMetronome={toggleMetronome}
        onPlayReference={playReference}
        onBackHome={goHome}
      />
    );
  }

  return (
    <HomeScreen
      progress={progress}
      potentialPhraseCount={potentialPhraseCount}
      onSelectLane={selectLane}
      onContinue={openPractice}
      onOpenProgress={() => setScreen('progress')}
    />
  );
}
