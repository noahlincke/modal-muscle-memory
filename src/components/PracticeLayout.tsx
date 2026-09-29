import { Fragment, useEffect, useState } from 'react';
import { getScaleOption } from '../content/scales';
import type { MicConnectionState } from '../lib/audio/micAccess';
import type { MidiConnectionState } from '../lib/midi/midiAccess';
import { intervalColorForTonicAndRoot } from '../lib/theory/intervalRing';
import { displayMusicText } from '../lib/theory/noteUtils';
import type {
  CircleVisualizationMode,
  CurriculumPresetId,
  EvaluationResult,
  ExerciseMode,
  KeySetId,
  Phrase,
  ScalePrompt,
} from '../types/music';
import type { InputMode } from '../types/progress';
import { CircleOfFifths } from './CircleOfFifths';
import { NotationStrip } from './NotationStrip';
import { PianoView } from './PianoView';
import { QwertyView } from './QwertyView';
import { WalkthroughBubble, type WalkthroughStep } from './WalkthroughBubble';

interface ExercisePickerItem {
  id: string;
  label: string;
  subtitle: string;
  masteryLabel: string;
  detailLabel: string;
  mastered: boolean;
}

interface KeySetPickerItem {
  id: KeySetId;
  label: string;
  description: string;
  selected: boolean;
}

interface CurriculumPickerItem {
  id: CurriculumPresetId;
  label: string;
  description: string;
  selected: boolean;
  disabled: boolean;
}

interface PracticeLayoutProps {
  exerciseMode: ExerciseMode;
  curriculumLabel: string;
  phrase: Phrase | null;
  scalePrompt?: ScalePrompt | null;
  hasCompatiblePhrases: boolean;
  clef: 'treble' | 'bass';
  currentEventIndex: number;
  completedEventIds: Set<string>;
  completedScaleNoteIndices?: Set<number>;
  currentScaleNoteIndex?: number;
  theme: 'light' | 'dark';
  activeNotes: Set<number>;
  minMidi: number;
  maxMidi: number;
  streak: number;
  deckMasteryPct: number;
  latestEvaluation: EvaluationResult | null;
  midiState: MidiConnectionState;
  micState: MicConnectionState;
  inputMode: InputMode;
  onTouchNoteOn?: (midi: number, velocity: number) => void;
  onTouchNoteOff?: (midi: number) => void;
  qwertyOctaveShift: number;
  tempo: number;
  keyboardTargetNotes: number[];
  flashcardAcceptedPitchClasses: string[];
  scaleGuideLabelMode: 'degrees' | 'note_names' | 'hidden';
  chordTonePitchClasses: string[];
  currentScalePitchClasses: string[];
  currentScaleGuideLabels: Record<string, string>;
  nextScalePitchClasses: string[];
  nextScaleGuideLabels: Record<string, string>;
  circleVisualizationMode: CircleVisualizationMode;
  notationVisible: boolean;
  showFlashcardScaffolding: boolean;
  keyboardVisible: boolean;
  metronomeEnabled: boolean;
  onTempoChange: (tempo: number) => void;
  onToggleScaleGuideLabelMode: () => void;
  onToggleCircleVisualizationMode: () => void;
  canStepExercise: boolean;
  exercisePickerItems: ExercisePickerItem[];
  includedKeysLabel: string;
  availableKeyRoots: string[];
  keySetPickerItems: KeySetPickerItem[];
  curriculumPickerItems: CurriculumPickerItem[];
  guidedFlowMode: 'random' | 'targeting_improvement' | 'musical_chaining';
  improvisationProgressionMode: 'random' | 'targeting_improvement' | 'chained';
  flashcardFlowMode: 'random' | 'targeting_improvement' | 'mixed_recall';
  scaleFlowMode: 'random' | 'targeting_improvement' | 'mixed_recall';
  chainMovement: number;
  onSelectExercise: (progressionId: string) => void;
  onSelectCurrentKey: (root: string) => void;
  onSelectKeySet: (keySetId: KeySetId) => void;
  onClearKeySet: () => void;
  onSelectMode: (mode: ExerciseMode) => void;
  onToggleCurriculumPreset: (presetId: CurriculumPresetId) => void;
  onSelectGuidedFlowMode: (mode: 'random' | 'targeting_improvement' | 'musical_chaining') => void;
  onSelectImprovisationProgressionMode: (mode: 'random' | 'targeting_improvement' | 'chained') => void;
  onSelectFlashcardFlowMode: (mode: 'random' | 'targeting_improvement' | 'mixed_recall') => void;
  onSelectScaleFlowMode: (mode: 'random' | 'targeting_improvement' | 'mixed_recall') => void;
  onSetChainMovement: (chainMovement: number) => void;
  onStepExerciseBackward: () => void;
  onStepExerciseForward: () => void;
  onToggleMetronome: () => void;
  onPlayReference: () => void;
  onOpenSettings: () => void;
  onOpenInputSettings: () => void;
  walkthroughStep: WalkthroughStep | null;
  onAdvanceWalkthrough: () => void;
  onDismissWalkthrough: () => void;
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.5 5.5-6.5 6.5 6.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MetronomeIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 20h10l-1.3-11H8.3L7 20Zm4.3-14 1.1-2h-1l-1.1 2H8.6L6.7 9h10.6l-1.9-3h-4.1Z" fill="currentColor" />
      <path d="m12 11 2.2 5.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {!enabled ? (
        <path d="M6 6 18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.7v12.6c0 .8.9 1.3 1.6.8l9-6.3c.6-.4.6-1.2 0-1.6l-9-6.3c-.7-.5-1.6 0-1.6.8Z" fill="currentColor" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10.4 3.5h3.2l.4 2.1a6.9 6.9 0 0 1 1.7.7l1.8-1 2.2 2.2-1 1.8c.3.5.6 1.1.7 1.7l2.1.4v3.2l-2.1.4a6.9 6.9 0 0 1-.7 1.7l1 1.8-2.2 2.2-1.8-1a6.9 6.9 0 0 1-1.7.7l-.4 2.1h-3.2l-.4-2.1a6.9 6.9 0 0 1-1.7-.7l-1.8 1-2.2-2.2 1-1.8a6.9 6.9 0 0 1-.7-1.7l-2.1-.4v-3.2l2.1-.4a6.9 6.9 0 0 1 .7-1.7l-1-1.8 2.2-2.2 1.8 1c.5-.3 1.1-.6 1.7-.7l.4-2.1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/* Quality-mark digits (V7, ii7) render as real superscript figures. */
function RomanFigures({ roman }: { roman: string }) {
  const match = roman.match(/^(.*?)(\d+)$/);
  if (!match) {
    return <>{roman}</>;
  }

  return (
    <>
      {match[1]}
      <sup className="roman-figure">{match[2]}</sup>
    </>
  );
}

function enDashProgression(label: string): string {
  return label.split('-').join(' – ');
}

function timingBucketLabel(bucket: EvaluationResult['timingBucket']): string {
  if (bucket === 'on_time') {
    return 'On Time';
  }
  if (bucket === 'early') {
    return 'Early';
  }
  return 'Late';
}

function chordStatusLabel(evaluation: EvaluationResult | null): string {
  if (!evaluation) {
    return '—';
  }

  const hasNonTimingError = evaluation.errors.some((error) => error.code !== 'early' && error.code !== 'late');
  return hasNonTimingError ? '✕' : '✓';
}

function FlashcardPrompt({
  symbol,
  revealed,
}: {
  symbol: string;
  revealed: boolean;
}) {
  return (
    <article className={`flashcard-prompt ${revealed ? 'is-revealed' : ''}`.trim()}>
      <p className="flashcard-prompt-caption">Play This Chord</p>
      <strong>{displayMusicText(symbol)}</strong>
      <span>{revealed ? 'Reference staff and keyboard revealed below.' : 'No notation hint until you miss.'}</span>
    </article>
  );
}

export function PracticeLayout({
  exerciseMode,
  curriculumLabel,
  phrase,
  scalePrompt = null,
  hasCompatiblePhrases,
  clef,
  currentEventIndex,
  completedEventIds,
  completedScaleNoteIndices = new Set<number>(),
  currentScaleNoteIndex = 0,
  theme,
  activeNotes,
  minMidi,
  maxMidi,
  streak,
  deckMasteryPct,
  latestEvaluation,
  midiState,
  micState,
  inputMode,
  onTouchNoteOn,
  onTouchNoteOff,
  qwertyOctaveShift,
  tempo,
  keyboardTargetNotes,
  flashcardAcceptedPitchClasses,
  scaleGuideLabelMode,
  chordTonePitchClasses,
  currentScalePitchClasses,
  currentScaleGuideLabels,
  nextScalePitchClasses,
  nextScaleGuideLabels,
  circleVisualizationMode,
  notationVisible,
  showFlashcardScaffolding,
  keyboardVisible,
  metronomeEnabled,
  onTempoChange,
  onToggleScaleGuideLabelMode,
  onToggleCircleVisualizationMode,
  canStepExercise,
  exercisePickerItems,
  includedKeysLabel,
  availableKeyRoots,
  keySetPickerItems,
  curriculumPickerItems,
  guidedFlowMode,
  improvisationProgressionMode,
  flashcardFlowMode,
  scaleFlowMode,
  chainMovement,
  onSelectExercise,
  onSelectCurrentKey,
  onSelectKeySet,
  onClearKeySet,
  onSelectMode,
  onToggleCurriculumPreset,
  onSelectGuidedFlowMode,
  onSelectImprovisationProgressionMode,
  onSelectFlashcardFlowMode,
  onSelectScaleFlowMode,
  onSetChainMovement,
  onStepExerciseBackward,
  onStepExerciseForward,
  onToggleMetronome,
  onPlayReference,
  onOpenSettings,
  onOpenInputSettings,
  walkthroughStep,
  onAdvanceWalkthrough,
  onDismissWalkthrough,
}: PracticeLayoutProps) {
  const hasPrimaryPrompt = Boolean(phrase || scalePrompt);
  const currentEvent = phrase ? phrase.events[currentEventIndex] : null;
  const currentToken = currentEvent ? phrase?.tokensById[currentEvent.chordTokenId] ?? null : null;
  const isScaleMode = exerciseMode === 'scale';
  const progressionSteps = isScaleMode
    ? (scalePrompt ? [getScaleOption(scalePrompt.scaleId).label] : [])
    : (phrase ? phrase.progression.steps.map((step) => step.roman) : []);
  const tonicLabel = scalePrompt?.tonic ?? phrase?.tonic ?? '—';

  const timingLabel = latestEvaluation ? timingBucketLabel(latestEvaluation.timingBucket) : '—';
  const chordLabel = chordStatusLabel(latestEvaluation);
  const chordHighlightColor = intervalColorForTonicAndRoot(
    scalePrompt?.tonic ?? phrase?.tonic ?? null,
    currentToken?.pitchClasses[0] ?? scalePrompt?.tonic ?? null,
  );
  const modeLabel = exerciseMode === 'improvisation'
    ? 'Improvisation'
    : (exerciseMode === 'chord_flashcards' ? 'Chord Flashcards' : (exerciseMode === 'scale' ? 'Scale' : 'Guided'));
  const showPerformanceStats = exerciseMode !== 'improvisation' && exerciseMode !== 'scale';
  const isFlashcardMode = exerciseMode === 'chord_flashcards';
  const isStandalonePromptMode = isFlashcardMode || isScaleMode;
  const [tempoInput, setTempoInput] = useState(() => String(tempo));
  const [openPicker, setOpenPicker] = useState<'exercise' | 'key' | 'content' | null>(null);
  const midiDeviceName = midiState.activeInputId
    ? midiState.inputs.find((input) => input.id === midiState.activeInputId)?.name ?? null
    : null;
  const inputLabel = inputMode === 'touch'
    ? 'Touch'
    : inputMode === 'midi'
      ? (midiDeviceName ? `MIDI · ${midiDeviceName}` : 'MIDI')
      : inputMode === 'qwerty' ? 'Keys' : 'Mic';
  const inputDotState = inputMode === 'touch' || inputMode === 'qwerty'
    ? 'ready'
    : inputMode === 'midi'
      ? (midiState.error ? 'error' : (midiState.ready ? 'ready' : 'idle'))
      : (micState.error ? 'error' : (micState.ready ? 'ready' : 'idle'));
  const keyboardLaneIsLabelCycleTarget = exerciseMode === 'improvisation';
  const keyboardLaneLabel = scaleGuideLabelMode === 'degrees'
    ? 'Scale guides shown as interval numbers. Click keyboard to show note names.'
    : (scaleGuideLabelMode === 'note_names'
      ? 'Scale guides shown as note names. Click keyboard to hide guide labels.'
      : 'Scale guide labels hidden. Click keyboard to show interval numbers.');
  const notationStripLabel = circleVisualizationMode === 'intervals'
    ? 'Circle view shown. Click staff to switch to Chord view.'
    : (circleVisualizationMode === 'chord_arrows'
      ? 'Chord view shown. Click staff to hide the circle of fifths.'
      : 'Circle of fifths hidden. Click staff to show Circle view.');
  const currentKeyDisplay = scalePrompt?.tonic ?? phrase?.tonic ?? availableKeyRoots[0] ?? null;
  const exercisePickerOpen = openPicker === 'exercise';
  const keyPickerOpen = openPicker === 'key';
  const contentPickerOpen = openPicker === 'content';
  const walkthroughActive = walkthroughStep !== null;
  const walkthroughMessage = walkthroughStep === 'exercise'
    ? 'Click the progression to choose a different exercise. The chevrons step through what is available.'
    : walkthroughStep === 'key'
      ? 'This is the current key and its signature. Click it to move around the circle of fifths.'
      : walkthroughStep === 'content'
        ? 'This line opens curriculum and practice mode.'
        : walkthroughStep === 'settings'
          ? 'This opens the settings drawer: input, sound, practice, display, and account.'
          : null;
  const walkthroughActionLabel = walkthroughStep === 'settings' ? 'Done' : 'Next';

  useEffect(() => {
    setTempoInput(String(tempo));
  }, [tempo]);

  useEffect(() => {
    if ((!hasPrimaryPrompt || exercisePickerItems.length === 0) && openPicker === 'exercise') {
      setOpenPicker(null);
    }
  }, [exercisePickerItems.length, hasPrimaryPrompt, openPicker]);

  useEffect(() => {
    if (walkthroughActive && openPicker) {
      setOpenPicker(null);
    }
  }, [openPicker, walkthroughActive]);

  useEffect(() => {
    if (!openPicker) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenPicker(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openPicker]);

  const commitTempoInput = () => {
    const trimmed = tempoInput.trim();
    if (trimmed.length === 0) {
      setTempoInput(String(tempo));
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setTempoInput(String(tempo));
      return;
    }

    onTempoChange(parsed);
  };

  const stepTempo = (delta: number) => {
    onTempoChange(tempo + delta);
  };

  return (
    <section className="practice-screen">
      <header className="practice-topbar">
        <span className="topbar-wordmark">
          <span className="topbar-wordmark-full">Modal Muscle Memory</span>
          <span className="topbar-wordmark-compact" aria-hidden="true">MMM</span>
        </span>

        <nav className="topbar-nav" aria-label="Exercise navigator">
          <button
            type="button"
            className="icon-button nav-chevron"
            onClick={onStepExerciseBackward}
            disabled={!canStepExercise}
            aria-label="Previous exercise"
            title="Previous exercise ( , )"
          >
            <ChevronLeftIcon />
          </button>

          <div className="topbar-nav-center">
            <div className="topbar-nav-row">
              <div className="walkthrough-anchor nav-progression-slot">
                <button
                  type="button"
                  className={`nav-progression ${walkthroughStep === 'exercise' ? 'walkthrough-target' : ''}`.trim()}
                  onClick={() => {
                    if (walkthroughActive) {
                      return;
                    }
                    setOpenPicker('exercise');
                  }}
                  disabled={!hasPrimaryPrompt || exercisePickerItems.length === 0}
                  aria-label="Choose current exercise"
                >
                  {progressionSteps.map((step, index) => (
                    <Fragment key={`${step}-${index}`}>
                      {index > 0 ? <span aria-hidden="true"> – </span> : null}
                      <RomanFigures roman={step} />
                    </Fragment>
                  ))}
                  {progressionSteps.length === 0 ? '—' : null}
                </button>
                {walkthroughStep === 'exercise' && walkthroughMessage ? (
                  <WalkthroughBubble
                    message={walkthroughMessage}
                    actionLabel={walkthroughActionLabel}
                    onAction={onAdvanceWalkthrough}
                    onSkip={onDismissWalkthrough}
                  />
                ) : null}
              </div>

              <div className="walkthrough-anchor nav-key-slot">
                <button
                  type="button"
                  className={`nav-key ${walkthroughStep === 'key' ? 'walkthrough-target' : ''}`.trim()}
                  onClick={() => {
                    if (walkthroughActive) {
                      return;
                    }
                    setOpenPicker('key');
                  }}
                  aria-label="Choose current key"
                >
                  in {tonicLabel === '—' ? '—' : displayMusicText(tonicLabel)}
                </button>
                {walkthroughStep === 'key' && walkthroughMessage ? (
                  <WalkthroughBubble
                    message={walkthroughMessage}
                    actionLabel={walkthroughActionLabel}
                    onAction={onAdvanceWalkthrough}
                    onSkip={onDismissWalkthrough}
                  />
                ) : null}
              </div>
            </div>

            <div className="walkthrough-anchor">
              <button
                type="button"
                className={`topbar-nav-sub ${walkthroughStep === 'content' ? 'walkthrough-target' : ''}`.trim()}
                onClick={() => {
                  if (walkthroughActive) {
                    return;
                  }
                  setOpenPicker('content');
                }}
                aria-label="Choose content"
              >
                {curriculumLabel} · {modeLabel}
              </button>
              {walkthroughStep === 'content' && walkthroughMessage ? (
                <WalkthroughBubble
                  message={walkthroughMessage}
                  actionLabel={walkthroughActionLabel}
                  onAction={onAdvanceWalkthrough}
                  onSkip={onDismissWalkthrough}
                />
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className="icon-button nav-chevron"
            onClick={onStepExerciseForward}
            disabled={!canStepExercise}
            aria-label="Next exercise"
            title="Next exercise ( . )"
          >
            <ChevronRightIcon />
          </button>
        </nav>

        <div className="topbar-actions">
          <div className="stepper" role="group" aria-label="Tempo in beats per minute">
            <button
              type="button"
              className="stepper-button"
              onClick={() => stepTempo(-1)}
              aria-label="Slower tempo"
              title="Slower tempo"
            >
              −
            </button>
            <input
              className="stepper-value"
              type="number"
              min={40}
              max={220}
              value={tempoInput}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setTempoInput(event.target.value)}
              onBlur={commitTempoInput}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
                if (event.key === 'Escape') {
                  setTempoInput(String(tempo));
                  event.currentTarget.blur();
                }
              }}
            />
            <button
              type="button"
              className="stepper-button"
              onClick={() => stepTempo(1)}
              aria-label="Faster tempo"
              title="Faster tempo"
            >
              +
            </button>
          </div>

          <button
            type="button"
            className="icon-button"
            aria-label={metronomeEnabled ? 'Disable metronome' : 'Enable metronome'}
            aria-pressed={metronomeEnabled}
            onClick={onToggleMetronome}
            title="Metronome"
          >
            <MetronomeIcon enabled={metronomeEnabled} />
          </button>

          <button
            type="button"
            className="icon-button"
            aria-label="Reference playback"
            onClick={onPlayReference}
            disabled={!hasPrimaryPrompt}
            title="Play reference"
          >
            <PlayIcon />
          </button>

          <button
            type="button"
            className="input-indicator"
            onClick={onOpenInputSettings}
            aria-label={`Input ${inputLabel}. Open input settings`}
            title="Input settings"
          >
            <span className="input-dot" data-state={inputDotState} aria-hidden="true" />
            <span className="input-indicator-label">{inputLabel}</span>
          </button>

          <div className="walkthrough-anchor walkthrough-anchor-topbar">
            <button
              type="button"
              className={`icon-button ${walkthroughStep === 'settings' ? 'walkthrough-target' : ''}`.trim()}
              aria-label="Practice settings"
              title="Settings"
              onClick={() => {
                if (walkthroughActive) {
                  return;
                }
                onOpenSettings();
              }}
            >
              <SettingsIcon />
            </button>
            {walkthroughStep === 'settings' && walkthroughMessage ? (
              <WalkthroughBubble
                message={walkthroughMessage}
                actionLabel={walkthroughActionLabel}
                onAction={onAdvanceWalkthrough}
                onSkip={onDismissWalkthrough}
                align="end"
              />
            ) : null}
          </div>
        </div>
      </header>

      {showPerformanceStats ? (
        <p className="stats-line">
          <span>Timing <span className="stats-value">{timingLabel}</span></span>
          <span aria-hidden="true">·</span>
          <span>Chord <span className={`stats-value ${chordLabel === '✓' ? 'is-good' : (chordLabel === '✕' ? 'is-bad' : '')}`.trim()}>{chordLabel}</span></span>
          <span aria-hidden="true">·</span>
          <span>Streak <span className="stats-value">{streak}</span></span>
          <span aria-hidden="true">·</span>
          <span>Mastery <span className="stats-value">{Math.round(deckMasteryPct)}%</span></span>
        </p>
      ) : <span aria-hidden="true" />}

      {exercisePickerOpen ? (
        <div className="exercise-picker-overlay" role="presentation" onClick={() => setOpenPicker(null)}>
          <section
            className="exercise-picker-window"
            role="dialog"
            aria-modal="true"
            aria-label="Choose exercise"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="exercise-picker-header">
              <h3>Choose a progression</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setOpenPicker(null)}
                aria-label="Close exercise picker"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="exercise-picker-list">
              {exercisePickerItems.map((item) => {
                const selected = phrase?.progressionId === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`picker-item ${selected ? 'is-selected' : ''} ${item.mastered ? 'is-mastered' : ''}`.trim()}
                    onClick={() => {
                      onSelectExercise(item.id);
                      setOpenPicker(null);
                    }}
                  >
                    <span className="picker-item-copy">
                      <strong>{enDashProgression(item.label)}</strong>
                      <span>{item.subtitle}</span>
                    </span>
                    <span className="picker-item-meta">
                      <strong>{item.masteryLabel}</strong>
                      <span>{item.detailLabel}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {keyPickerOpen ? (
        <div className="exercise-picker-overlay" role="presentation" onClick={() => setOpenPicker(null)}>
          <section
            className="exercise-picker-window exercise-picker-window-wide exercise-picker-window-compact"
            role="dialog"
            aria-modal="true"
            aria-label="Choose current key"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="exercise-picker-header">
              <h3>Choose current key</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setOpenPicker(null)}
                aria-label="Close key picker"
                title="Close"
              >
                ×
              </button>
            </div>
            <p className="settings-help">Click any tonic on the circle of fifths. Choosing a key outside the current set adds it automatically.</p>
            <div className="exercise-picker-circle">
              <CircleOfFifths
                currentTonic={currentKeyDisplay}
                currentChordRoot={null}
                currentChordPitchClasses={[]}
                visualizationMode={circleVisualizationMode === 'hidden' ? 'intervals' : circleVisualizationMode}
                includedRoots={availableKeyRoots}
                selectedTonic={phrase?.tonic ?? null}
                onSelectRoot={onSelectCurrentKey}
              />
            </div>

            <div className="exercise-picker-section-head">
              <h3>Key Set</h3>
              <button
                type="button"
                className="settings-potential-toggle"
                onClick={onClearKeySet}
                disabled={availableKeyRoots.length === 0}
              >
                Clear Key Set
              </button>
            </div>
            <div className="picker-grid">
              {keySetPickerItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`picker-cell ${item.selected ? 'is-selected' : ''}`.trim()}
                  onClick={() => onSelectKeySet(item.id)}
                  title={item.description}
                >
                  <strong>{item.label}</strong>
                </button>
              ))}
            </div>
            <p className="settings-help">Included keys: {includedKeysLabel}</p>
          </section>
        </div>
      ) : null}

      {contentPickerOpen ? (
        <div className="exercise-picker-overlay" role="presentation" onClick={() => setOpenPicker(null)}>
          <section
            className="exercise-picker-window exercise-picker-window-wide exercise-picker-window-compact exercise-picker-window-content"
            role="dialog"
            aria-modal="true"
            aria-label="Choose content"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="exercise-picker-header">
              <h3>Choose content</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setOpenPicker(null)}
                aria-label="Close content picker"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="settings-row">
              <span className="settings-row-label">Practice mode</span>
              <div className="seg" role="group" aria-label="Practice mode">
                {([
                  ['guided', 'Guided'],
                  ['improvisation', 'Improv'],
                  ['chord_flashcards', 'Flashcards'],
                  ['scale', 'Scale'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="seg-option"
                    aria-pressed={exerciseMode === value}
                    onClick={() => onSelectMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row">
              <span className="settings-row-label">Flow</span>
              <div
                className="seg"
                role="group"
                aria-label={exerciseMode === 'improvisation'
                  ? 'Improvisation flow'
                  : (exerciseMode === 'chord_flashcards'
                    ? 'Flashcard flow'
                    : (exerciseMode === 'scale' ? 'Scale flow' : 'Guided flow'))}
              >
                {exerciseMode === 'improvisation' ? (
                  <>
                    <button type="button" className="seg-option" aria-pressed={improvisationProgressionMode === 'random'} onClick={() => onSelectImprovisationProgressionMode('random')}>Random</button>
                    <button type="button" className="seg-option" aria-pressed={improvisationProgressionMode === 'targeting_improvement'} onClick={() => onSelectImprovisationProgressionMode('targeting_improvement')}>Improvement</button>
                    <button type="button" className="seg-option" aria-pressed={improvisationProgressionMode === 'chained'} onClick={() => onSelectImprovisationProgressionMode('chained')}>Chained</button>
                  </>
                ) : exerciseMode === 'chord_flashcards' ? (
                  <>
                    <button type="button" className="seg-option" aria-pressed={flashcardFlowMode === 'random'} onClick={() => onSelectFlashcardFlowMode('random')}>Random</button>
                    <button type="button" className="seg-option" aria-pressed={flashcardFlowMode === 'targeting_improvement'} onClick={() => onSelectFlashcardFlowMode('targeting_improvement')}>Improvement</button>
                    <button type="button" className="seg-option" aria-pressed={flashcardFlowMode === 'mixed_recall'} onClick={() => onSelectFlashcardFlowMode('mixed_recall')}>Mixed Recall</button>
                  </>
                ) : exerciseMode === 'scale' ? (
                  <>
                    <button type="button" className="seg-option" aria-pressed={scaleFlowMode === 'random'} onClick={() => onSelectScaleFlowMode('random')}>Random</button>
                    <button type="button" className="seg-option" aria-pressed={scaleFlowMode === 'targeting_improvement'} onClick={() => onSelectScaleFlowMode('targeting_improvement')}>Improvement</button>
                    <button type="button" className="seg-option" aria-pressed={scaleFlowMode === 'mixed_recall'} onClick={() => onSelectScaleFlowMode('mixed_recall')}>Mixed Recall</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="seg-option" aria-pressed={guidedFlowMode === 'random'} onClick={() => onSelectGuidedFlowMode('random')}>Random</button>
                    <button type="button" className="seg-option" aria-pressed={guidedFlowMode === 'targeting_improvement'} onClick={() => onSelectGuidedFlowMode('targeting_improvement')}>Improvement</button>
                    <button type="button" className="seg-option" aria-pressed={guidedFlowMode === 'musical_chaining'} onClick={() => onSelectGuidedFlowMode('musical_chaining')}>Chained</button>
                  </>
                )}
              </div>
            </div>

            <div>
              <div className="settings-row">
                <span className="settings-row-label">Motion</span>
                <span className="settings-row-value">{chainMovement}% moving</span>
              </div>
              <input
                className="settings-range"
                type="range"
                min={0}
                max={100}
                step={1}
                value={chainMovement}
                onChange={(event) => onSetChainMovement(Number(event.target.value))}
                aria-label={exerciseMode === 'improvisation'
                  ? 'Improvisation flow motion'
                  : (exerciseMode === 'chord_flashcards'
                    ? 'Flashcard flow motion'
                    : (exerciseMode === 'scale' ? 'Scale flow motion' : 'Guided flow motion'))}
              />
              <div className="settings-range-labels" aria-hidden="true">
                <span>Repetitive</span>
                <span>Moving</span>
              </div>
              <p className="settings-help">Repetitive repeats recent or weak material more often. Moving prefers less recent progressions and exits short loops sooner.</p>
            </div>

            <div>
              <h3>Curriculum</h3>
              <p className="settings-help">Select one or more curriculum groups. Selecting the full set collapses to Full Library.</p>
              <div className="settings-lane-grid">
                {curriculumPickerItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`settings-lane-card ${item.selected ? 'is-selected' : ''}`.trim()}
                    disabled={item.disabled}
                    onClick={() => onToggleCurriculumPreset(item.id)}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {walkthroughActive ? <div className="walkthrough-overlay" aria-hidden="true" /> : null}

      <div className={`practice-workstack ${(circleVisualizationMode === 'hidden' || isStandalonePromptMode) ? 'is-circle-hidden' : ''}`.trim()}>
        <div
          className={`practice-notation-slot ${!isStandalonePromptMode ? 'is-circle-cycle-target' : ''}`.trim()}
          role={!isStandalonePromptMode ? 'button' : undefined}
          tabIndex={!isStandalonePromptMode ? 0 : undefined}
          aria-label={!isStandalonePromptMode ? notationStripLabel : undefined}
          title={!isStandalonePromptMode ? notationStripLabel : undefined}
          onClick={!isStandalonePromptMode ? onToggleCircleVisualizationMode : undefined}
          onKeyDown={!isStandalonePromptMode
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onToggleCircleVisualizationMode();
                }
              }
            : undefined}
        >
          {isFlashcardMode && currentToken ? (
            <FlashcardPrompt symbol={currentToken.symbol} revealed={showFlashcardScaffolding} />
          ) : null}
          {notationVisible ? (
            <NotationStrip
              phrase={phrase}
              scalePrompt={scalePrompt}
              hasCompatiblePhrases={hasCompatiblePhrases}
              clef={clef}
              exerciseMode={exerciseMode}
              currentEventIndex={currentEventIndex}
              completedEventIds={completedEventIds}
              completedScaleNoteIndices={completedScaleNoteIndices}
              currentScaleNoteIndex={currentScaleNoteIndex}
              theme={theme}
            />
          ) : null}
        </div>

        {circleVisualizationMode !== 'hidden' && !isStandalonePromptMode ? (
          <aside className="practice-sidebar">
            <CircleOfFifths
              currentTonic={phrase?.tonic ?? null}
              currentChordRoot={currentToken?.pitchClasses[0] ?? null}
              currentChordPitchClasses={currentToken?.pitchClasses ?? []}
              visualizationMode={circleVisualizationMode}
            />
          </aside>
        ) : null}

        {keyboardVisible ? (
          <div
            className={`keyboard-lane ${keyboardLaneIsLabelCycleTarget ? 'is-label-cycle-target' : ''}`.trim()}
            role={keyboardLaneIsLabelCycleTarget ? 'button' : undefined}
            tabIndex={keyboardLaneIsLabelCycleTarget ? 0 : undefined}
            aria-label={keyboardLaneIsLabelCycleTarget ? keyboardLaneLabel : undefined}
            title={keyboardLaneIsLabelCycleTarget ? keyboardLaneLabel : undefined}
            onClick={keyboardLaneIsLabelCycleTarget ? onToggleScaleGuideLabelMode : undefined}
            onKeyDown={keyboardLaneIsLabelCycleTarget
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onToggleScaleGuideLabelMode();
                  }
                }
              : undefined}
          >
            {inputMode === 'qwerty' ? (
              <QwertyView
                tonic={scalePrompt?.tonic ?? phrase?.tonic ?? null}
                mode={exerciseMode}
                clef={clef}
                octaveShift={qwertyOctaveShift}
                targetNotes={keyboardTargetNotes}
                scalePrompt={scalePrompt}
                completedScaleNoteIndices={completedScaleNoteIndices}
                flashcardAcceptedPitchClasses={flashcardAcceptedPitchClasses}
                chordTonePitchClasses={chordTonePitchClasses}
                currentScalePitchClasses={currentScalePitchClasses}
                currentScaleGuideLabels={currentScaleGuideLabels}
                nextScalePitchClasses={nextScalePitchClasses}
                nextScaleGuideLabels={nextScaleGuideLabels}
                activeNotes={activeNotes}
                highlightColor={chordHighlightColor}
              />
            ) : (
              <PianoView
                tonic={scalePrompt?.tonic ?? phrase?.tonic ?? null}
                mode={exerciseMode}
                clef={clef}
                minMidi={minMidi}
                maxMidi={maxMidi}
                targetNotes={keyboardTargetNotes}
                scalePrompt={scalePrompt}
                completedScaleNoteIndices={completedScaleNoteIndices}
                flashcardAcceptedPitchClasses={flashcardAcceptedPitchClasses}
                chordTonePitchClasses={chordTonePitchClasses}
                currentScalePitchClasses={currentScalePitchClasses}
                currentScaleGuideLabels={currentScaleGuideLabels}
                nextScalePitchClasses={nextScalePitchClasses}
                nextScaleGuideLabels={nextScaleGuideLabels}
                activeNotes={activeNotes}
                highlightColor={chordHighlightColor}
                onNoteOn={onTouchNoteOn}
                onNoteOff={onTouchNoteOff}
              />
            )}
          </div>
        ) : null}
      </div>

    </section>
  );
}
