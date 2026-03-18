import type { ProgressState } from '../types/progress';

interface ProgressScreenProps {
  progress: ProgressState;
  onBack: () => void;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function ProgressScreen({ progress, onBack }: ProgressScreenProps) {
  const weakestTransitions = Object.entries(progress.edgeMastery)
    .sort((a, b) => a[1].accuracyEwma - b[1].accuracyEwma)
    .slice(0, 8);

  const laneMastery = Object.entries(progress.nodeMastery).reduce<Record<string, { sum: number; count: number }>>(
    (acc, [tokenId, stat]) => {
      const lane = tokenId.split(':')[0] ?? 'unknown';
      const current = acc[lane] ?? { sum: 0, count: 0 };
      current.sum += stat.accuracyEwma;
      current.count += 1;
      acc[lane] = current;
      return acc;
    },
    {},
  );

  const voicingMastery = Object.entries(progress.nodeMastery).reduce<Record<string, { sum: number; count: number }>>(
    (acc, [tokenId, stat]) => {
      const voicing = tokenId.split(':')[3] ?? 'unknown';
      const current = acc[voicing] ?? { sum: 0, count: 0 };
      current.sum += stat.accuracyEwma;
      current.count += 1;
      acc[voicing] = current;
      return acc;
    },
    {},
  );

  return (
    <section className="progress-screen">
      <header>
        <h1>Progress</h1>
        <button type="button" onClick={onBack}>Back to Home</button>
      </header>

      <div className="progress-grid">
        <article>
          <h2>Mastery by Mode</h2>
          <ul>
            {Object.entries(laneMastery).map(([lane, summary]) => (
              <li key={lane}>
                <span>{lane}</span>
                <strong>{pct(summary.sum / Math.max(summary.count, 1))}</strong>
              </li>
            ))}
          </ul>
        </article>

        <article>
          <h2>Mastery by Voicing</h2>
          <ul>
            {Object.entries(voicingMastery).map(([voicing, summary]) => (
              <li key={voicing}>
                <span>{voicing}</span>
                <strong>{pct(summary.sum / Math.max(summary.count, 1))}</strong>
              </li>
            ))}
          </ul>
        </article>

        <article>
          <h2>Weakest Transitions</h2>
          <ul>
            {weakestTransitions.length === 0 ? <li>No transition data yet.</li> : null}
            {weakestTransitions.map(([transition, stat]) => (
              <li key={transition}>
                <span>{transition}</span>
                <strong>{pct(stat.accuracyEwma)}</strong>
              </li>
            ))}
          </ul>
        </article>

        <article>
          <h2>Unlocked Roots</h2>
          <ul>
            {Object.entries(progress.unlocksByLane).map(([lane, unlock]) => (
              <li key={lane}>
                <span>{lane}</span>
                <strong>{unlock.roots.join(', ') || '—'}</strong>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="session-history">
        <h2>Recent Sessions</h2>
        <ul>
          {progress.sessionHistory.length === 0 ? <li>No session history yet.</li> : null}
          {progress.sessionHistory.slice(-10).reverse().map((session) => (
            <li key={session.id}>
              <span>{new Date(session.endedAt).toLocaleString()}</span>
              <span>{session.lane}</span>
              <strong>{pct(session.accuracy)}</strong>
              <span>{Math.round(session.medianTransitionLatencyMs)} ms</span>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
