import type { ModeLane, RhythmCellId, RhythmSelection } from '../types/music';
import type { ProgressState } from '../types/progress';

interface PracticeSettingsDrawerProps {
  progress: ProgressState;
  potentialPhraseCount: number;
  onClose: () => void;
  onOpenProgress: () => void;
  onSelectMode: (mode: ProgressState['exerciseConfig']['mode']) => void;
  onSelectLane: (lane: ModeLane) => void;
  onSelectRhythm: (rhythm: RhythmSelection) => void;
  onSelectImprovisationProgressionMode: (
    mode: ProgressState['exerciseConfig']['improvisationProgressionMode'],
  ) => void;
  onSetChainMovement: (chainMovement: number) => void;
}

const LANE_OPTIONS: Array<{ lane: ModeLane; label: string }> = [
  { lane: 'ionian', label: 'Ionian' },
  { lane: 'aeolian', label: 'Aeolian' },
  { lane: 'ionian_aeolian_mixture', label: 'Ionian + Aeolian' },
  { lane: 'dorian', label: 'Dorian' },
  { lane: 'mixolydian', label: 'Mixolydian' },
  { lane: 'lydian', label: 'Lydian' },
  { lane: 'phrygian', label: 'Phrygian' },
];

const RHYTHM_OPTIONS: Array<{ value: RhythmSelection; label: string }> = [
  { value: 'all', label: 'All Unlocked' },
  { value: 'block_whole', label: 'Whole Notes' },
  { value: 'quarters', label: 'Quarter Notes' },
  { value: 'charleston', label: 'Charleston' },
];

function rhythmLabel(id: RhythmCellId): string {
  switch (id) {
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
      return id;
  }
}

export function PracticeSettingsDrawer({
  progress,
  potentialPhraseCount,
  onClose,
  onOpenProgress,
  onSelectMode,
  onSelectLane,
  onSelectRhythm,
  onSelectImprovisationProgressionMode,
  onSetChainMovement,
}: PracticeSettingsDrawerProps) {
  const isImprovisationMode = progress.exerciseConfig.mode === 'improvisation';

  return (
    <div className="settings-overlay" role="presentation" onClick={onClose}>
      <aside
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Practice settings"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <div>
            <p className="eyebrow">Practice Settings</p>
            <h2>Configure the exercise surface</h2>
          </div>
          <button type="button" className="icon-button settings-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </header>

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Practice Mode</h3>
            <p>Switch between strict chord drilling and the scale-guided improvisation path.</p>
          </div>
          <div className="settings-pill-row">
            <button
              type="button"
              className={`settings-pill ${progress.exerciseConfig.mode === 'guided' ? 'active' : ''}`.trim()}
              onClick={() => onSelectMode('guided')}
            >
              Guided
            </button>
            <button
              type="button"
              className={`settings-pill ${progress.exerciseConfig.mode === 'improvisation' ? 'active' : ''}`.trim()}
              onClick={() => onSelectMode('improvisation')}
            >
              Improvisation
            </button>
          </div>
        </section>

        {isImprovisationMode ? (
          <section className="settings-section">
            <div className="settings-section-copy">
              <h3>Improvisation Flow</h3>
              <p>Keep drawing random progressions, or chain each new phrase from the last one.</p>
            </div>

            <div className="settings-pill-row">
              <button
                type="button"
                className={`settings-pill ${progress.exerciseConfig.improvisationProgressionMode === 'random' ? 'active' : ''}`.trim()}
                onClick={() => onSelectImprovisationProgressionMode('random')}
              >
                Random
              </button>
              <button
                type="button"
                className={`settings-pill ${progress.exerciseConfig.improvisationProgressionMode === 'chained' ? 'active' : ''}`.trim()}
                onClick={() => onSelectImprovisationProgressionMode('chained')}
              >
                Chained
              </button>
            </div>

            {progress.exerciseConfig.improvisationProgressionMode === 'chained' ? (
              <div className="settings-slider-stack">
                <div className="settings-slider-copy">
                  <strong>Chain Motion</strong>
                  <span>{progress.exerciseConfig.chainMovement}% moving</span>
                </div>
                <input
                  className="settings-range"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={progress.exerciseConfig.chainMovement}
                  onChange={(event) => onSetChainMovement(Number(event.target.value))}
                  aria-label="Chain motion"
                />
                <div className="settings-range-labels" aria-hidden="true">
                  <span>Repetitive</span>
                  <span>Moving</span>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Mode</h3>
            <p>Choose the current harmonic lane. Installed packs are live; upcoming lanes are shown but inactive.</p>
          </div>
          <div className="settings-lane-grid">
            {LANE_OPTIONS.map(({ lane, label }) => {
              const unlock = progress.unlocksByLane[lane];
              const isInstalled = unlock.unlockedPackIds.length > 0;
              return (
                <button
                  key={lane}
                  type="button"
                  className={`settings-lane-card ${progress.exerciseConfig.lane === lane ? 'selected' : ''}`.trim()}
                  onClick={() => onSelectLane(lane)}
                  disabled={!isInstalled}
                >
                  <strong>{label}</strong>
                  <span>
                    {isInstalled
                      ? `Roots ${unlock.roots.join(', ') || 'none'}`
                      : 'Content not installed yet'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Rhythm</h3>
            <p>Constrain phrase generation to one rhythm feel, or leave it on all unlocked.</p>
          </div>
          <div className="settings-pill-row">
            {RHYTHM_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`settings-pill ${progress.exerciseConfig.rhythm === option.value ? 'active' : ''}`.trim()}
                onClick={() => onSelectRhythm(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="settings-meta">
            Active unlocked rhythms: {progress.unlocksByLane[progress.exerciseConfig.lane].rhythms.map(rhythmLabel).join(', ') || 'none'}
          </p>
        </section>

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Profile</h3>
            <p>Progress remains local for now. Cloud save will attach here once auth and sync land.</p>
          </div>
          <div className="settings-actions">
            <button type="button" onClick={onOpenProgress}>View Progress</button>
            <span className="settings-meta">Potential guided phrases: {potentialPhraseCount}</span>
          </div>
        </section>
      </aside>
    </div>
  );
}
