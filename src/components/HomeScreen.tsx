import type { ModeLane } from '../types/music';
import type { ProgressState } from '../types/progress';

interface HomeScreenProps {
  progress: ProgressState;
  potentialPhraseCount: number;
  onSelectLane: (lane: ModeLane) => void;
  onContinue: () => void;
  onOpenProgress: () => void;
}

const STARTER_LANES: ModeLane[] = ['ionian', 'aeolian', 'ionian_aeolian_mixture'];

function laneLabel(lane: ModeLane): string {
  if (lane === 'ionian_aeolian_mixture') return 'Ionian + Aeolian';
  return lane[0].toUpperCase() + lane.slice(1);
}

export function HomeScreen({
  progress,
  potentialPhraseCount,
  onSelectLane,
  onContinue,
  onOpenProgress,
}: HomeScreenProps) {
  return (
    <section className="home-screen">
      <header>
        <p className="eyebrow">Modal Muscle Memory Trainer</p>
        <h1>Phrase-first adaptive piano practice</h1>
        <p>
          MIDI-first practice loop with notation, keyboard targets, circle-of-fifths context,
          and mastery-based unlocks.
        </p>
      </header>

      <div className="lane-grid">
        {STARTER_LANES.map((lane) => {
          const unlock = progress.unlocksByLane[lane];
          return (
            <button
              key={lane}
              type="button"
              className={`lane-card ${progress.selectedLane === lane ? 'selected' : ''}`.trim()}
              onClick={() => onSelectLane(lane)}
            >
              <h2>{laneLabel(lane)}</h2>
              <p>Roots: {unlock.roots.join(', ') || 'none'}</p>
              <p>Voicings: {unlock.voicings.join(', ') || 'none'}</p>
              <p>Rhythms: {unlock.rhythms.join(', ') || 'none'}</p>
            </button>
          );
        })}
      </div>

      <div className="home-actions">
        <button type="button" className="primary" onClick={onContinue}>
          Continue Practice
        </button>
        <button type="button" onClick={onOpenProgress}>
          View Progress
        </button>
      </div>

      <footer>
        <span>Lane: {laneLabel(progress.selectedLane)}</span>
        <span>Potential starter phrases: {potentialPhraseCount}</span>
      </footer>
    </section>
  );
}
