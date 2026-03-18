import { useEffect, useState } from 'react';
import type { MidiConnectionState } from '../lib/midi/midiAccess';
import { intervalColorForTonicAndRoot } from '../lib/theory/intervalRing';
import type { EvaluationResult, ModeLane, Phrase } from '../types/music';
import { CircleOfFifths } from './CircleOfFifths';
import { NotationStrip } from './NotationStrip';
import { PianoView } from './PianoView';

interface PracticeLayoutProps {
  lane: ModeLane;
  phrase: Phrase | null;
  clef: 'treble' | 'bass';
  currentEventIndex: number;
  completedEventIds: Set<string>;
  activeNotes: Set<number>;
  minMidi: number;
  maxMidi: number;
  streak: number;
  deckMasteryPct: number;
  latestEvaluation: EvaluationResult | null;
  midiState: MidiConnectionState;
  tempo: number;
  keyboardTargetNotes: number[];
  keyboardVisible: boolean;
  metronomeEnabled: boolean;
  onTempoChange: (tempo: number) => void;
  onToggleKeyboardVisible: () => void;
  onToggleClef: () => void;
  onToggleMetronome: () => void;
  onPlayReference: () => void;
  onBackHome: () => void;
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

function ClefIcon({ clef }: { clef: 'treble' | 'bass' }) {
  return <span aria-hidden="true">{clef === 'bass' ? '𝄢' : '𝄞'}</span>;
}

function laneLabel(lane: ModeLane): string {
  if (lane === 'ionian_aeolian_mixture') {
    return 'Ionian + Aeolian';
  }
  return lane[0].toUpperCase() + lane.slice(1);
}

function rhythmLabelFromDuration(durationBeats: number): string {
  if (durationBeats >= 4) return 'Whole Notes';
  if (durationBeats >= 2) return 'Half Notes';
  if (durationBeats >= 1) return 'Quarter Notes';
  return `${durationBeats.toFixed(1)}-Beat Hits`;
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
  lane,
  phrase,
  clef,
  currentEventIndex,
  completedEventIds,
  activeNotes,
  minMidi,
  maxMidi,
  streak,
  deckMasteryPct,
  latestEvaluation,
  midiState,
  tempo,
  keyboardTargetNotes,
  keyboardVisible,
  metronomeEnabled,
  onTempoChange,
  onToggleKeyboardVisible,
  onToggleClef,
  onToggleMetronome,
  onPlayReference,
  onBackHome,
}: PracticeLayoutProps) {
  const currentEvent = phrase ? phrase.events[currentEventIndex] : null;
  const currentToken = currentEvent ? phrase?.tokensById[currentEvent.chordTokenId] ?? null : null;
  const progressionLabel = phrase
    ? phrase.events
      .map((event) => phrase.tokensById[event.chordTokenId]?.roman ?? phrase.tokensById[event.chordTokenId]?.symbol ?? '—')
      .join('-')
    : '—';

  const currentRhythmLabel = currentEvent ? rhythmLabelFromDuration(currentEvent.durationBeats) : '—';
  const timingLabel = latestEvaluation ? timingBucketLabel(latestEvaluation.timingBucket) : '—';
  const chordLabel = latestEvaluation ? (latestEvaluation.success ? '✓' : 'X') : '—';
  const chordHighlightColor = intervalColorForTonicAndRoot(phrase?.tonic ?? null, currentToken?.pitchClasses[0] ?? null);
  const [tempoInput, setTempoInput] = useState(() => String(tempo));

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
        <button type="button" onClick={onBackHome}>Home</button>

        <div className="practice-controls">
          {!midiState.ready ? (
            <span className="midi-warning">MIDI not detected</span>
          ) : null}

          <button
            type="button"
            className={`icon-button ${keyboardVisible ? 'active' : ''}`.trim()}
            aria-label={keyboardVisible ? 'Hide keyboard panel' : 'Show keyboard panel'}
            onClick={onToggleKeyboardVisible}
            title={keyboardVisible ? 'Hide keyboard panel' : 'Show keyboard panel'}
          >
            <KeyboardIcon />
          </button>

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
        </div>
      </header>

      <section className="practice-hud-strip">
        <article className="hud-exercise-card">
          <p className="hud-caption">Current Exercise</p>
          <h2>{progressionLabel}</h2>
        </article>

        <div className="hud-stat-grid">
          <div className="hud-stat">
            <span>Lane</span>
            <strong>{laneLabel(lane)}</strong>
          </div>
          <div className="hud-stat">
            <span>Rhythm</span>
            <strong>{currentRhythmLabel}</strong>
          </div>
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
      </section>

      <div className="practice-main-grid">
        <article className={`practice-main ${keyboardVisible ? '' : 'keyboard-hidden'}`.trim()}>
          <NotationStrip
            phrase={phrase}
            clef={clef}
            currentEventIndex={currentEventIndex}
            completedEventIds={completedEventIds}
          />

          {keyboardVisible ? (
            <div className="keyboard-lane">
              <PianoView
                minMidi={minMidi}
                maxMidi={maxMidi}
                targetNotes={keyboardTargetNotes}
                activeNotes={activeNotes}
                highlightColor={chordHighlightColor}
              />
            </div>
          ) : null}
        </article>

        <aside className="practice-sidebar">
          <CircleOfFifths
            currentTonic={phrase?.tonic ?? null}
            currentChordRoot={currentToken?.pitchClasses[0] ?? null}
          />
        </aside>
      </div>
    </section>
  );
}
