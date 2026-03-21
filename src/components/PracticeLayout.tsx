import { useEffect, useState } from 'react';
import type { MidiConnectionState } from '../lib/midi/midiAccess';
import { intervalColorForTonicAndRoot } from '../lib/theory/intervalRing';
import type { EvaluationResult, ExerciseMode, ModeLane, Phrase } from '../types/music';
import { CircleOfFifths } from './CircleOfFifths';
import { NotationStrip } from './NotationStrip';
import { PianoView } from './PianoView';
import { ThemeToggle } from './ThemeToggle';

interface PracticeLayoutProps {
  exerciseMode: ExerciseMode;
  lane: ModeLane;
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
  tempo: number;
  keyboardTargetNotes: number[];
  scaleGuideLabelMode: 'degrees' | 'note_names';
  chordTonePitchClasses: string[];
  currentScalePitchClasses: string[];
  currentScaleGuideLabels: Record<string, string>;
  nextScalePitchClasses: string[];
  nextScaleGuideLabels: Record<string, string>;
  keyboardVisible: boolean;
  metronomeEnabled: boolean;
  onTempoChange: (tempo: number) => void;
  onToggleKeyboardVisible: () => void;
  onToggleScaleGuideLabelMode: () => void;
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

function laneLabel(lane: ModeLane): string {
  if (lane === 'ionian_aeolian_mixture') {
    return 'Ionian + Aeolian';
  }
  return lane[0].toUpperCase() + lane.slice(1);
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
  lane,
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
  tempo,
  keyboardTargetNotes,
  scaleGuideLabelMode,
  chordTonePitchClasses,
  currentScalePitchClasses,
  currentScaleGuideLabels,
  nextScalePitchClasses,
  nextScaleGuideLabels,
  keyboardVisible,
  metronomeEnabled,
  onTempoChange,
  onToggleKeyboardVisible,
  onToggleScaleGuideLabelMode,
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

  const currentRhythmLabel = currentEvent ? rhythmLabelFromId(currentEvent.rhythmCellId) : '—';
  const timingLabel = latestEvaluation ? timingBucketLabel(latestEvaluation.timingBucket) : '—';
  const chordLabel = latestEvaluation ? (latestEvaluation.success ? '✓' : 'X') : '—';
  const chordHighlightColor = intervalColorForTonicAndRoot(phrase?.tonic ?? null, currentToken?.pitchClasses[0] ?? null);
  const modeLabel = exerciseMode === 'improvisation' ? 'Improvisation' : 'Guided Practice';
  const showPerformanceStats = exerciseMode !== 'improvisation';
  const [tempoInput, setTempoInput] = useState(() => String(tempo));
  const midiWarning = midiState.error ?? 'MIDI not detected';

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
          <strong>{laneLabel(lane)} {modeLabel}</strong>
        </div>

        <div className="practice-controls">
          {!midiState.ready ? (
            <span className="midi-warning">{midiWarning}</span>
          ) : null}

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />

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
        <article className="hud-exercise-card">
          <p className="hud-caption">Current Exercise</p>
          <h2>{progressionLabel}</h2>
        </article>

        <div className={`hud-stat-grid ${showPerformanceStats ? '' : 'compact'}`.trim()}>
          <div className="hud-stat">
            <span>Lane</span>
            <strong>{laneLabel(lane)}</strong>
          </div>
          <div className="hud-stat">
            <span>Rhythm</span>
            <strong>{currentRhythmLabel}</strong>
          </div>
          {showPerformanceStats ? (
            <>
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
            </>
          ) : null}
        </div>
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
          />
        </aside>

        {keyboardVisible ? (
          <div className="keyboard-lane">
            {exerciseMode === 'improvisation' ? (
              <p className="keyboard-caption">
                Solid dots mark chord tones. The lower row shows the current scale and the upper row shows the next scale. Use the 123/Eb button to swap interval numbers and note names.
              </p>
            ) : null}
            <PianoView
              mode={exerciseMode}
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
          </div>
        ) : null}
      </div>
    </section>
  );
}
