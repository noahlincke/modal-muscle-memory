import { useEffect, useState } from 'react';
import { keySignatureForRoot } from '../content/keys';
import type { MidiConnectionState } from '../lib/midi/midiAccess';
import { progressionSubtitle } from '../lib/progressionLabels';
import { intervalColorForTonicAndRoot } from '../lib/theory/intervalRing';
import type { CircleVisualizationMode, EvaluationResult, ExerciseMode, Phrase } from '../types/music';
import { CircleOfFifths } from './CircleOfFifths';
import { NotationStrip } from './NotationStrip';
import { PianoView } from './PianoView';
import { QwertyView } from './QwertyView';
import { ThemeToggle } from './ThemeToggle';

interface ExercisePickerItem {
  id: string;
  label: string;
  subtitle: string;
  masteryLabel: string;
  detailLabel: string;
  mastered: boolean;
}

interface PracticeLayoutProps {
  exerciseMode: ExerciseMode;
  curriculumLabel: string;
  practiceTrackingMode: 'test' | 'play';
  phrase: Phrase | null;
  hasCompatiblePhrases: boolean;
  clef: 'treble' | 'bass';
  currentEventIndex: number;
  completedEventIds: Set<string>;
  theme: 'light' | 'dark' | 'focus';
  activeNotes: Set<number>;
  minMidi: number;
  maxMidi: number;
  streak: number;
  deckMasteryPct: number;
  latestEvaluation: EvaluationResult | null;
  midiState: MidiConnectionState;
  inputMode: 'midi' | 'qwerty';
  canStepKey: boolean;
  qwertyOctaveShift: number;
  tempo: number;
  keyboardTargetNotes: number[];
  scaleGuideLabelMode: 'degrees' | 'note_names';
  chordTonePitchClasses: string[];
  currentScalePitchClasses: string[];
  currentScaleGuideLabels: Record<string, string>;
  nextScalePitchClasses: string[];
  nextScaleGuideLabels: Record<string, string>;
  circleVisualizationMode: CircleVisualizationMode;
  immersiveMode: boolean;
  keyboardVisible: boolean;
  metronomeEnabled: boolean;
  onTempoChange: (tempo: number) => void;
  onToggleKeyboardVisible: () => void;
  onTogglePracticeTrackingMode: () => void;
  onToggleScaleGuideLabelMode: () => void;
  onToggleCircleVisualizationMode: () => void;
  onToggleImmersiveMode: () => void;
  onToggleClef: () => void;
  canStepCurriculum: boolean;
  onStepCurriculumBackward: () => void;
  onStepCurriculumForward: () => void;
  canStepMode: boolean;
  onStepModeBackward: () => void;
  onStepModeForward: () => void;
  canStepExercise: boolean;
  exercisePickerItems: ExercisePickerItem[];
  onSelectExercise: (progressionId: string) => void;
  onStepExerciseBackward: () => void;
  onStepExerciseForward: () => void;
  onStepKeyBackward: () => void;
  onStepKeyForward: () => void;
  onToggleMetronome: () => void;
  onToggleTheme: () => void;
  onPlayReference: () => void;
  onOpenSettings: () => void;
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

function KeyboardIcon({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6.5" width="18" height="11" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.2 10.2v7.3M9.5 10.2v7.3M12.8 10.2v7.3M16.1 10.2v7.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {!visible ? (
        <path d="M5.4 5.4 18.6 18.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

function CircleArrowIcon({ mode }: { mode: CircleVisualizationMode }) {
  if (mode === 'intervals') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="5.8" r="1.4" fill="currentColor" />
        <circle cx="17.4" cy="15.1" r="1.4" fill="currentColor" />
        <circle cx="6.6" cy="15.1" r="1.4" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 12 17.2 8.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="m15.7 8.3 1.9.3-.8 1.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

function FullscreenIcon({ immersive }: { immersive: boolean }) {
  if (immersive) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4.5H4.5V9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.2 9.2 4.8 4.8M14.8 9.2l4.4-4.4M14.8 14.8l4.4 4.4M9.2 14.8l-4.4 4.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PracticeModeIcon({ mode }: { mode: 'test' | 'play' }) {
  if (mode === 'play') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M8.4 6.2v8.4a2.9 2.9 0 1 0 1.8 2.7V10l7.4-1.9v4.9a2.9 2.9 0 1 0 1.8 2.7V4.8L8.4 6.2Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.2 3.8h9.8l3.2 3.2v12.2a1.6 1.6 0 0 1-1.6 1.6H6.2a1.6 1.6 0 0 1-1.6-1.6V5.4a1.6 1.6 0 0 1 1.6-1.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M16 3.8v4h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m9 15.9 5.9-5.9 1.9 1.9-5.9 5.9H9v-1.9Z" fill="currentColor" />
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

function ClefIcon({ clef }: { clef: 'treble' | 'bass' }) {
  return <span aria-hidden="true">{clef === 'bass' ? '𝄢' : '𝄞'}</span>;
}

const TREBLE_SHARP_Y_POSITIONS = [16, 25, 13, 22, 31, 19, 28] as const;
const TREBLE_FLAT_Y_POSITIONS = [28, 19, 31, 22, 34, 25, 37] as const;
const KEY_SIGNATURE_VIEWBOX_WIDTH = 56;

function KeySignatureStaff({ tonic }: { tonic: string | null }) {
  const signature = tonic ? keySignatureForRoot(tonic) : null;
  if (!signature) {
    return null;
  }

  const symbol = signature.symbol === 'flat' ? '♭' : '♯';
  const label = signature.count === 0
    ? 'no accidentals'
    : `${signature.count} ${signature.symbol}${signature.count === 1 ? '' : 's'}`;
  const yPositions = signature.symbol === 'flat' ? TREBLE_FLAT_Y_POSITIONS : TREBLE_SHARP_Y_POSITIONS;
  const lineStartX = 4;
  const lineEndX = KEY_SIGNATURE_VIEWBOX_WIDTH - 4;
  const accidentalStepX = 6;
  const accidentalSpan = signature.count > 1 ? (signature.count - 1) * accidentalStepX : 0;
  const accidentalStartX = (KEY_SIGNATURE_VIEWBOX_WIDTH / 2) - (accidentalSpan / 2);

  return (
    <span className="key-signature-staff" role="img" aria-label={`Treble key signature: ${label}`}>
      <svg className="key-signature-svg" viewBox={`0 0 ${KEY_SIGNATURE_VIEWBOX_WIDTH} 48`} aria-hidden="true" focusable="false">
        {[16, 22, 28, 34, 40].map((y) => (
          <line
            key={`staff-line-${y}`}
            className="key-signature-line"
            x1={lineStartX}
            y1={y}
            x2={lineEndX}
            y2={y}
          />
        ))}
        {Array.from({ length: signature.count }, (_, index) => (
          <text
            key={`key-signature-${signature.symbol}-${index}`}
            x={accidentalStartX + (index * accidentalStepX)}
            y={yPositions[index]}
            className={`key-signature-glyph ${signature.symbol}`.trim()}
          >
            {symbol}
          </text>
        ))}
      </svg>
    </span>
  );
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
  return hasNonTimingError ? 'X' : '✓';
}

export function PracticeLayout({
  exerciseMode,
  curriculumLabel,
  practiceTrackingMode,
  phrase,
  hasCompatiblePhrases,
  clef,
  currentEventIndex,
  completedEventIds,
  theme,
  activeNotes,
  minMidi,
  maxMidi,
  streak,
  deckMasteryPct,
  latestEvaluation,
  midiState,
  inputMode,
  canStepKey,
  qwertyOctaveShift,
  tempo,
  keyboardTargetNotes,
  scaleGuideLabelMode,
  chordTonePitchClasses,
  currentScalePitchClasses,
  currentScaleGuideLabels,
  nextScalePitchClasses,
  nextScaleGuideLabels,
  circleVisualizationMode,
  immersiveMode,
  keyboardVisible,
  metronomeEnabled,
  onTempoChange,
  onToggleKeyboardVisible,
  onTogglePracticeTrackingMode,
  onToggleScaleGuideLabelMode,
  onToggleCircleVisualizationMode,
  onToggleImmersiveMode,
  onToggleClef,
  canStepCurriculum,
  onStepCurriculumBackward,
  onStepCurriculumForward,
  canStepMode,
  onStepModeBackward,
  onStepModeForward,
  canStepExercise,
  exercisePickerItems,
  onSelectExercise,
  onStepExerciseBackward,
  onStepExerciseForward,
  onStepKeyBackward,
  onStepKeyForward,
  onToggleMetronome,
  onToggleTheme,
  onPlayReference,
  onOpenSettings,
}: PracticeLayoutProps) {
  const currentEvent = phrase ? phrase.events[currentEventIndex] : null;
  const currentToken = currentEvent ? phrase?.tokensById[currentEvent.chordTokenId] ?? null : null;
  const progressionLabel = phrase
    ? phrase.progression.steps
      .map((step) => step.roman)
      .join('-')
    : '—';
  const progressionSubtitleLabel = phrase ? progressionSubtitle(phrase.progression.id) : null;
  const tonicLabel = phrase?.tonic ?? '—';

  const timingLabel = latestEvaluation ? timingBucketLabel(latestEvaluation.timingBucket) : '—';
  const chordLabel = chordStatusLabel(latestEvaluation);
  const chordHighlightColor = intervalColorForTonicAndRoot(phrase?.tonic ?? null, currentToken?.pitchClasses[0] ?? null);
  const modeLabel = exerciseMode === 'improvisation' ? 'Improvisation' : 'Guided';
  const showPerformanceStats = exerciseMode !== 'improvisation';
  const [tempoInput, setTempoInput] = useState(() => String(tempo));
  const [showKeyboardGuide, setShowKeyboardGuide] = useState(false);
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);
  const midiWarning = inputMode === 'qwerty'
    ? 'QWERTY mode active · connect MIDI to switch'
    : (midiState.error ?? 'MIDI not detected');

  useEffect(() => {
    setTempoInput(String(tempo));
  }, [tempo]);

  useEffect(() => {
    if (exerciseMode !== 'improvisation' || !keyboardVisible) {
      setShowKeyboardGuide(false);
    }
  }, [exerciseMode, keyboardVisible]);

  useEffect(() => {
    if (!phrase || exercisePickerItems.length === 0) {
      setExercisePickerOpen(false);
    }
  }, [exercisePickerItems.length, phrase]);

  useEffect(() => {
    if (!exercisePickerOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExercisePickerOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exercisePickerOpen]);

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

  return (
    <section className="practice-screen">
      <header className="practice-topbar">
        <div className="practice-heading">
          <strong>Modal Muscle Memory</strong>
        </div>

        <div className="practice-controls">
          {inputMode === 'qwerty' || !midiState.ready ? (
            <span className="midi-warning">{midiWarning}</span>
          ) : null}

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />

          <button
            type="button"
            className="icon-button"
            aria-label={immersiveMode ? 'Exit immersive fullscreen mode' : 'Enter immersive fullscreen mode'}
            title={immersiveMode ? 'Exit immersive mode' : 'Enter immersive mode'}
            onClick={onToggleImmersiveMode}
          >
            <FullscreenIcon immersive={immersiveMode} />
          </button>

          <button
            type="button"
            className="icon-button circle-visual-toggle"
            aria-label={circleVisualizationMode === 'chord_arrows'
              ? 'Circle arrows active. Switch to interval markers'
              : 'Circle intervals active. Switch to chord arrows'}
            title={circleVisualizationMode === 'chord_arrows' ? 'Circle view: chord arrows' : 'Circle view: interval markers'}
            onClick={onToggleCircleVisualizationMode}
          >
            <CircleArrowIcon mode={circleVisualizationMode} />
          </button>

          <button
            type="button"
            className="icon-button"
            aria-label={practiceTrackingMode === 'test'
              ? 'Test mode active. Count attempts and mastery. Switch to play mode'
              : 'Play mode active. Do not count attempts or mastery. Switch to test mode'}
            onClick={onTogglePracticeTrackingMode}
            title={practiceTrackingMode === 'test'
              ? 'Test mode: count accuracy and progress'
              : 'Play mode: free practice without counting progress'}
          >
            <PracticeModeIcon mode={practiceTrackingMode} />
          </button>

          <button
            type="button"
            className="icon-button"
            aria-label={keyboardVisible ? 'Hide keyboard panel' : 'Show keyboard panel'}
            onClick={onToggleKeyboardVisible}
            title={keyboardVisible ? 'Hide keyboard panel' : 'Show keyboard panel'}
          >
            <KeyboardIcon visible={keyboardVisible} />
          </button>

          {exerciseMode === 'improvisation' ? (
            <button
              type="button"
              className="icon-button label-mode-button"
              aria-label={scaleGuideLabelMode === 'degrees' ? 'Show scale guides as note names' : 'Show scale guides as interval numbers'}
              onClick={onToggleScaleGuideLabelMode}
              title={scaleGuideLabelMode === 'degrees' ? 'Scale guides: interval numbers' : 'Scale guides: note names'}
            >
              <span aria-hidden="true">{scaleGuideLabelMode === 'degrees' ? '123' : 'Eb'}</span>
            </button>
          ) : null}

          <button
            type="button"
            className="icon-button clef-button"
            aria-label={clef === 'bass' ? 'Switch to treble clef' : 'Switch to bass clef'}
            onClick={onToggleClef}
            title={clef === 'bass' ? 'Bass clef' : 'Treble clef'}
          >
            <ClefIcon clef={clef} />
          </button>

          <button
            type="button"
            className="icon-button"
            aria-label={metronomeEnabled ? 'Disable metronome' : 'Enable metronome'}
            onClick={onToggleMetronome}
          >
            <MetronomeIcon enabled={metronomeEnabled} />
          </button>

          <label className="tempo-field" aria-label="Tempo in BPM">
            <input
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
          </label>

          <button
            type="button"
            className="icon-button"
            aria-label="Reference playback"
            onClick={onPlayReference}
            disabled={!phrase}
          >
            <PlayIcon />
          </button>

          <button
            type="button"
            className="icon-button"
            aria-label="Practice settings"
            onClick={onOpenSettings}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <section className="practice-hud-strip">
        <div className="hud-primary-strip">
          <article className="hud-primary-cell hud-primary-exercise">
            <p className="hud-caption">Current Exercise</p>
            <div className="hud-primary-exercise-row">
              <button
                type="button"
                className="hud-key-step"
                onClick={(event) => {
                  event.stopPropagation();
                  onStepExerciseBackward();
                }}
                disabled={!canStepExercise}
                aria-label="Previous available exercise"
              >
                <span className="hud-key-step-glyph" aria-hidden="true">,</span>
              </button>
              <button
                type="button"
                className="hud-primary-value hud-primary-exercise-value hud-exercise-picker-trigger"
                onClick={() => setExercisePickerOpen(true)}
                disabled={!phrase || exercisePickerItems.length === 0}
                aria-label="Choose current exercise"
              >
                <span>{progressionLabel}</span>
                {progressionSubtitleLabel ? <small>{progressionSubtitleLabel}</small> : null}
              </button>
              <button
                type="button"
                className="hud-key-step"
                onClick={(event) => {
                  event.stopPropagation();
                  onStepExerciseForward();
                }}
                disabled={!canStepExercise}
                aria-label="Next available exercise"
              >
                <span className="hud-key-step-glyph" aria-hidden="true">.</span>
              </button>
            </div>
          </article>

          <article className="hud-primary-cell hud-primary-key">
            <p className="hud-caption">Current Key</p>
            <div className="hud-primary-key-row">
              <button
                type="button"
                className="hud-key-step"
                onClick={onStepKeyBackward}
                disabled={!canStepKey}
                aria-label="Previous available key on the circle of fifths"
              >
                <span className="hud-key-step-glyph" aria-hidden="true">&lt;</span>
              </button>
              <div className="hud-primary-value hud-primary-key-value">
                <span>{tonicLabel}</span>
                <KeySignatureStaff tonic={phrase?.tonic ?? null} />
              </div>
              <button
                type="button"
                className="hud-key-step"
                onClick={onStepKeyForward}
                disabled={!canStepKey}
                aria-label="Next available key on the circle of fifths"
              >
                <span className="hud-key-step-glyph" aria-hidden="true">&gt;</span>
              </button>
            </div>
          </article>

          <article className="hud-primary-cell hud-primary-content">
            <p className="hud-caption">Content</p>
            <div className="hud-primary-content-row">
              <div className="hud-primary-content-controls">
                <button
                  type="button"
                  className="hud-key-step hud-key-step-stacked"
                  onClick={onStepCurriculumBackward}
                  disabled={!canStepCurriculum}
                  aria-label="Previous curriculum preset"
                >
                  <span className="hud-key-step-glyph" aria-hidden="true">_</span>
                </button>
                <button
                  type="button"
                  className="hud-key-step hud-key-step-stacked"
                  onClick={onStepModeBackward}
                  disabled={!canStepMode}
                  aria-label="Previous exercise mode"
                >
                  <span className="hud-key-step-glyph" aria-hidden="true">-</span>
                </button>
              </div>
              <div className="hud-primary-value hud-primary-exercise-value hud-primary-content-value">
                <span>{curriculumLabel}</span>
                <small>{modeLabel}</small>
              </div>
              <div className="hud-primary-content-controls">
                <button
                  type="button"
                  className="hud-key-step hud-key-step-stacked"
                  onClick={onStepCurriculumForward}
                  disabled={!canStepCurriculum}
                  aria-label="Next curriculum preset"
                >
                  <span className="hud-key-step-glyph" aria-hidden="true">+</span>
                </button>
                <button
                  type="button"
                  className="hud-key-step hud-key-step-stacked"
                  onClick={onStepModeForward}
                  disabled={!canStepMode}
                  aria-label="Next exercise mode"
                >
                  <span className="hud-key-step-glyph" aria-hidden="true">=</span>
                </button>
              </div>
            </div>
          </article>
        </div>

        {showPerformanceStats ? (
          <div className="hud-stat-grid">
            <div className="hud-stat">
              <span>Timing</span>
              <strong>{timingLabel}</strong>
            </div>
            <div className="hud-stat">
              <span>Chord</span>
              <strong className="hud-chord-mark">{chordLabel}</strong>
            </div>
            <div className="hud-stat">
              <span>Streak</span>
              <strong>{streak}</strong>
            </div>
            <div className="hud-stat">
              <span>Mastery</span>
              <strong>{Math.round(deckMasteryPct)}%</strong>
            </div>
          </div>
        ) : null}
      </section>

      {exercisePickerOpen ? (
        <div className="exercise-picker-overlay" role="presentation" onClick={() => setExercisePickerOpen(false)}>
          <section
            className="exercise-picker-window"
            role="dialog"
            aria-modal="true"
            aria-label="Choose exercise"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="exercise-picker-header">
              <div>
                <p className="eyebrow">Current Filter</p>
                <h3>Choose a progression</h3>
              </div>
              <button
                type="button"
                className="icon-button settings-close"
                onClick={() => setExercisePickerOpen(false)}
                aria-label="Close exercise picker"
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
                    className={`exercise-picker-pill ${selected ? 'selected' : ''} ${item.mastered ? 'mastered' : ''}`.trim()}
                    onClick={() => {
                      onSelectExercise(item.id);
                      setExercisePickerOpen(false);
                    }}
                  >
                    <span className="exercise-picker-pill-copy">
                      <strong>{item.label}</strong>
                      <span>{item.subtitle}</span>
                    </span>
                    <span className="exercise-picker-pill-meta">
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

      <div className="practice-workstack">
        <div className="practice-notation-slot">
          <NotationStrip
            phrase={phrase}
            hasCompatiblePhrases={hasCompatiblePhrases}
            clef={clef}
            exerciseMode={exerciseMode}
            currentEventIndex={currentEventIndex}
            completedEventIds={completedEventIds}
            theme={theme}
          />
        </div>

        <aside className="practice-sidebar">
          <CircleOfFifths
            currentTonic={phrase?.tonic ?? null}
            currentChordRoot={currentToken?.pitchClasses[0] ?? null}
            currentChordPitchClasses={currentToken?.pitchClasses ?? []}
            visualizationMode={circleVisualizationMode}
          />
        </aside>

        {keyboardVisible ? (
          <div
            className={`keyboard-lane ${exerciseMode === 'improvisation' ? 'is-interactive' : ''}`.trim()}
            onClick={exerciseMode === 'improvisation' ? () => setShowKeyboardGuide((value) => !value) : undefined}
            onKeyDown={exerciseMode === 'improvisation'
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setShowKeyboardGuide((value) => !value);
                  }
                }
              : undefined}
            role={exerciseMode === 'improvisation' ? 'button' : undefined}
            tabIndex={exerciseMode === 'improvisation' ? 0 : undefined}
            aria-expanded={exerciseMode === 'improvisation' ? showKeyboardGuide : undefined}
            aria-label={exerciseMode === 'improvisation'
              ? (showKeyboardGuide ? 'Hide keyboard guide' : 'Show keyboard guide')
              : undefined}
          >
            {inputMode === 'qwerty' ? (
              <p className="keyboard-caption">
                Computer keyboard mode. Z shifts down, X shifts up, and bass clef resets the board to A = C3.
              </p>
            ) : null}
            {exerciseMode === 'improvisation' ? (
              <div className={`keyboard-guide-panel ${showKeyboardGuide ? 'is-open' : ''}`.trim()}>
                <p className="keyboard-caption keyboard-guide-copy">
                  Solid dots mark chord tones. The lower row shows the current scale and the upper row shows the next scale. Use the 123/Eb button to swap interval numbers and note names.
                </p>
              </div>
            ) : null}
            {inputMode === 'qwerty' ? (
              <QwertyView
                mode={exerciseMode}
                clef={clef}
                octaveShift={qwertyOctaveShift}
                targetNotes={keyboardTargetNotes}
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
                mode={exerciseMode}
                clef={clef}
                minMidi={minMidi}
                maxMidi={maxMidi}
                targetNotes={keyboardTargetNotes}
                chordTonePitchClasses={chordTonePitchClasses}
                currentScalePitchClasses={currentScalePitchClasses}
                currentScaleGuideLabels={currentScaleGuideLabels}
                nextScalePitchClasses={nextScalePitchClasses}
                nextScaleGuideLabels={nextScaleGuideLabels}
                activeNotes={activeNotes}
                highlightColor={chordHighlightColor}
              />
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
