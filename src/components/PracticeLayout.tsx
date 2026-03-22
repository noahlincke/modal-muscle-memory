import { useEffect, useState } from 'react';
import type { MidiConnectionState } from '../lib/midi/midiAccess';
import { progressionSubtitle } from '../lib/progressionLabels';
import { intervalColorForTonicAndRoot } from '../lib/theory/intervalRing';
import type { CircleVisualizationMode, EvaluationResult, ExerciseMode, Phrase } from '../types/music';
import { CircleOfFifths } from './CircleOfFifths';
import { NotationStrip } from './NotationStrip';
import { PianoView } from './PianoView';
import { QwertyView } from './QwertyView';
import { ThemeToggle } from './ThemeToggle';

interface PracticeLayoutProps {
  exerciseMode: ExerciseMode;
  curriculumLabel: string;
  practiceTrackingMode: 'test' | 'play';
  phrase: Phrase | null;
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
  onToggleMetronome: () => void;
  onToggleTheme: () => void;
  onPlayReference: () => void;
  onOpenSettings: () => void;
}

function MetronomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 20h10l-1.3-11H8.3L7 20Zm4.3-14 1.1-2h-1l-1.1 2H8.6L6.7 9h10.6l-1.9-3h-4.1Z" fill="currentColor" />
      <path d="m12 11 2.2 5.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6.5" width="18" height="11" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.2 10.2v7.3M9.5 10.2v7.3M12.8 10.2v7.3M16.1 10.2v7.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CircleArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 12 17.2 8.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="m15.7 8.3 1.9.3-.8 1.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

function FullscreenIcon() {
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

function rhythmLabelFromId(rhythmCellId: string | null): string {
  switch (rhythmCellId) {
    case 'block_whole':
      return 'Whole Notes';
    case 'quarters':
      return 'Quarter Notes';
    case 'charleston':
      return 'Charleston';
    case 'anticipation_4and':
      return 'Anticipation';
    case 'offbeat_1and_3':
      return 'Offbeats';
    case 'syncopated_2and_4':
      return 'Syncopated';
    default:
      return '—';
  }
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

export function PracticeLayout({
  exerciseMode,
  curriculumLabel,
  practiceTrackingMode,
  phrase,
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

  const currentRhythmLabel = currentEvent ? rhythmLabelFromId(currentEvent.rhythmCellId) : '—';
  const timingLabel = latestEvaluation ? timingBucketLabel(latestEvaluation.timingBucket) : '—';
  const chordLabel = latestEvaluation ? (latestEvaluation.success ? '✓' : 'X') : '—';
  const chordHighlightColor = intervalColorForTonicAndRoot(phrase?.tonic ?? null, currentToken?.pitchClasses[0] ?? null);
  const modeLabel = exerciseMode === 'improvisation' ? 'Improvisation' : 'Guided Practice';
  const showPerformanceStats = exerciseMode !== 'improvisation';
  const [tempoInput, setTempoInput] = useState(() => String(tempo));
  const midiWarning = inputMode === 'qwerty'
    ? 'QWERTY mode active · connect MIDI to switch'
    : (midiState.error ?? 'MIDI not detected');

  useEffect(() => {
    setTempoInput(String(tempo));
  }, [tempo]);

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
          <p className="eyebrow">Modal Muscle Memory</p>
          <strong>{curriculumLabel} {modeLabel}</strong>
        </div>

        <div className="practice-controls">
          {inputMode === 'qwerty' || !midiState.ready ? (
            <span className="midi-warning">{midiWarning}</span>
          ) : null}

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />

          <button
            type="button"
            className={`icon-button ${immersiveMode ? 'active' : ''}`.trim()}
            aria-label={immersiveMode ? 'Exit immersive fullscreen mode' : 'Enter immersive fullscreen mode'}
            title={immersiveMode ? 'Exit immersive mode' : 'Enter immersive mode'}
            onClick={onToggleImmersiveMode}
          >
            <FullscreenIcon />
          </button>

          <button
            type="button"
            className={`icon-button circle-visual-toggle ${circleVisualizationMode === 'chord_arrows' ? 'active' : ''}`.trim()}
            aria-label={circleVisualizationMode === 'chord_arrows'
              ? 'Circle arrows active. Switch to interval markers'
              : 'Circle intervals active. Switch to chord arrows'}
            title={circleVisualizationMode === 'chord_arrows' ? 'Circle view: chord arrows' : 'Circle view: interval markers'}
            onClick={onToggleCircleVisualizationMode}
          >
            <CircleArrowIcon />
          </button>

          <button
            type="button"
            className={`icon-button ${practiceTrackingMode === 'test' ? 'active' : ''}`.trim()}
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
            className={`icon-button ${keyboardVisible ? 'active' : ''}`.trim()}
            aria-label={keyboardVisible ? 'Hide keyboard panel' : 'Show keyboard panel'}
            onClick={onToggleKeyboardVisible}
            title={keyboardVisible ? 'Hide keyboard panel' : 'Show keyboard panel'}
          >
            <KeyboardIcon />
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
            className={`icon-button ${metronomeEnabled ? 'active' : ''}`.trim()}
            aria-label={metronomeEnabled ? 'Disable metronome' : 'Enable metronome'}
            onClick={onToggleMetronome}
          >
            <MetronomeIcon />
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
            <div className="hud-primary-value hud-primary-exercise-value">
              <span>{progressionLabel}</span>
              {progressionSubtitleLabel ? <small>{progressionSubtitleLabel}</small> : null}
            </div>
          </article>

          <article className="hud-primary-cell hud-primary-key">
            <p className="hud-caption">Current Key</p>
            <div className="hud-primary-value">{tonicLabel}</div>
          </article>

          <article className="hud-primary-cell">
            <p className="hud-caption">Content</p>
            <div className="hud-primary-value hud-primary-meta">{curriculumLabel}</div>
          </article>

          {exerciseMode === 'guided' ? (
            <article className="hud-primary-cell">
              <p className="hud-caption">Rhythm</p>
              <div className="hud-primary-value hud-primary-meta">{currentRhythmLabel}</div>
            </article>
          ) : null}
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

      <div className="practice-workstack">
        <div className="practice-notation-slot">
          <NotationStrip
            phrase={phrase}
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
          <div className="keyboard-lane">
            {inputMode === 'qwerty' ? (
              <p className="keyboard-caption">
                Computer keyboard mode. Z shifts down, X shifts up, and bass clef resets the board to A = C3.
              </p>
            ) : exerciseMode === 'improvisation' ? (
              <p className="keyboard-caption">
                Solid dots mark chord tones. The lower row shows the current scale and the upper row shows the next scale. Use the 123/Eb button to swap interval numbers and note names.
              </p>
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
