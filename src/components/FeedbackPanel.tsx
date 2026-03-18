import type { EvaluationResult } from '../types/music';

interface FeedbackPanelProps {
  latest: EvaluationResult | null;
  streak: number;
  deckMasteryPct: number;
}

export function FeedbackPanel({
  latest,
  streak,
  deckMasteryPct,
}: FeedbackPanelProps) {
  return (
    <section className="feedback-panel">
      <div className="feedback-row">
        <strong>Timing</strong>
        <span>{latest ? latest.timingBucket.replace('_', ' ') : '—'}</span>
      </div>
      <div className="feedback-row">
        <strong>Chord</strong>
        <span>{latest ? (latest.success ? 'Correct' : latest.errors[0]?.message ?? 'Retry') : '—'}</span>
      </div>
      <div className="feedback-row">
        <strong>Streak</strong>
        <span>{streak}</span>
      </div>
      <div className="deck-meter" aria-label="Deck mastery meter">
        <div className="deck-meter-fill" style={{ width: `${Math.min(100, Math.max(0, deckMasteryPct))}%` }} />
      </div>
      <small>{Math.round(deckMasteryPct)}% deck mastery</small>
    </section>
  );
}
