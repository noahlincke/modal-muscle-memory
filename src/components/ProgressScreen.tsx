import { useState } from 'react';
import { CONTENT_BLOCKS, getCurriculumPreset } from '../content/curriculum';
import {
  buildProgressionMasterySummaries,
  MASTERY_MIN_ATTEMPTS,
  MASTERY_TARGET_ACCURACY,
} from '../lib/progressionMastery';
import { humanizeSnakeCase, progressionRomanSummary, progressionSubtitle } from '../lib/progressionLabels';
import type { CurriculumPresetId, ProgressionDefinition } from '../types/music';
import type { ProgressState, SessionRecord } from '../types/progress';

interface ProgressScreenProps {
  progress: ProgressState;
  theme: 'light' | 'dark';
  onBack: () => void;
  onToggleTheme: () => void;
}

interface ProgressionSummary {
  progression: ProgressionDefinition;
  attempts: number;
  recentAccuracy: number;
  improvement: number | null;
  mastered: boolean;
  lastPracticedAt: string | null;
  contentBlockLabel: string;
}

interface PracticeBlock {
  id: string;
  mode: 'guided' | 'improvisation' | 'chord_flashcards' | 'scale';
  curriculumPresetId: string | null;
  lane: string;
  startedAt: string;
  endedAt: string;
  phraseIds: string[];
  accuracy: number;
  phraseCount: number;
}

const SESSIONS_PER_WEEK_TARGET = 2;
const PRACTICE_BLOCK_GAP_MS = 1000 * 60 * 12;

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signedPoints(delta: number | null): string {
  if (delta === null || Number.isNaN(delta)) {
    return 'Building baseline';
  }

  const points = Math.round(delta * 100);
  if (points === 0) {
    return 'Flat';
  }

  return `${points > 0 ? '+' : ''}${points} pts`;
}

// Music text renders with superscript quality marks (V⁷, ii⁷) and en-dash
// separators per the design spec.
function romanSummary(progression: ProgressionDefinition): string {
  return progressionRomanSummary(progression).replace(/ -> /g, ' – ').replace(/7/g, '⁷');
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) {
    return 'No sessions yet';
  }

  const target = new Date(iso);
  const today = new Date();
  const oneDayMs = 1000 * 60 * 60 * 24;
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dayDiff = Math.round((todayDay - targetDay) / oneDayMs);

  if (dayDiff <= 0) {
    return 'Today';
  }
  if (dayDiff === 1) {
    return 'Yesterday';
  }
  return `${dayDiff} days ago`;
}

function groupPracticeBlocks(sessionHistory: SessionRecord[]): PracticeBlock[] {
  const sorted = [...sessionHistory].sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime());
  const blocks: PracticeBlock[] = [];

  sorted.forEach((session) => {
    const phraseCount = Math.max(1, session.phraseIds.length);
    const mode = session.mode === 'improvisation'
      ? 'improvisation'
      : (session.mode === 'chord_flashcards' ? 'chord_flashcards' : (session.mode === 'scale' ? 'scale' : 'guided'));
    const curriculumPresetId = session.curriculumPresetId ?? null;
    const previous = blocks[blocks.length - 1];
    const gapMs = previous
      ? new Date(session.startedAt).getTime() - new Date(previous.endedAt).getTime()
      : Number.POSITIVE_INFINITY;

    if (
      previous
      && previous.mode === mode
      && previous.curriculumPresetId === curriculumPresetId
      && gapMs <= PRACTICE_BLOCK_GAP_MS
    ) {
      const combinedPhraseCount = previous.phraseCount + phraseCount;
      previous.endedAt = session.endedAt;
      previous.phraseIds = [...previous.phraseIds, ...session.phraseIds];
      previous.accuracy = ((previous.accuracy * previous.phraseCount) + (session.accuracy * phraseCount)) / combinedPhraseCount;
      previous.phraseCount = combinedPhraseCount;
      return;
    }

    blocks.push({
      id: session.id,
      mode,
      curriculumPresetId,
      lane: session.lane,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      phraseIds: [...session.phraseIds],
      accuracy: session.accuracy,
      phraseCount,
    });
  });

  return blocks;
}

function startOfWeek(date: Date): Date {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = normalized.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setDate(normalized.getDate() + diff);
  return normalized;
}

function weekKey(date: Date): string {
  const start = startOfWeek(date);
  return `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function consistencyStreak(blocks: PracticeBlock[]): { weeks: number; thisWeekCount: number } {
  const counts = new Map<string, number>();
  blocks.forEach((block) => {
    const key = weekKey(new Date(block.endedAt));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const currentWeek = startOfWeek(new Date());
  const currentWeekKey = weekKey(currentWeek);
  const thisWeekCount = counts.get(currentWeekKey) ?? 0;
  let cursor = thisWeekCount >= SESSIONS_PER_WEEK_TARGET ? currentWeek : addDays(currentWeek, -7);
  let streakWeeks = 0;

  while ((counts.get(weekKey(cursor)) ?? 0) >= SESSIONS_PER_WEEK_TARGET) {
    streakWeeks += 1;
    cursor = addDays(cursor, -7);
  }

  return { weeks: streakWeeks, thisWeekCount };
}

function blockLabelByProgressionId(): Map<string, string> {
  return CONTENT_BLOCKS.reduce((result, block) => {
    block.progressionIds.forEach((progressionId) => {
      result.set(progressionId, block.label);
    });
    return result;
  }, new Map<string, string>());
}

function practiceBlockLabel(block: PracticeBlock): string {
  const presetLabel = block.curriculumPresetId
    ? getCurriculumPreset(block.curriculumPresetId as CurriculumPresetId)?.label ?? null
    : null;
  const modeLabel = block.mode === 'improvisation'
    ? 'Improvisation'
    : (block.mode === 'chord_flashcards' ? 'Chord Flashcards' : (block.mode === 'scale' ? 'Scale' : 'Guided'));
  return `${presetLabel ?? humanizeSnakeCase(block.lane)} · ${modeLabel}`;
}

function romanFromTokenId(tokenId: string | undefined): string {
  const roman = tokenId?.split(':')[2];
  if (roman) {
    return roman.replace(/7/g, '⁷');
  }
  // Shortened ids ("ionian:I") fall back to the degree segment, then the raw value.
  return tokenId?.split(':')[1] ?? tokenId ?? 'Unknown';
}

function transitionLabel(key: string): string {
  const [fromTokenId, toTokenId] = key.includes('->') ? key.split('->') : key.split('>');
  return `${romanFromTokenId(fromTokenId)} – ${romanFromTokenId(toTokenId)}`;
}

export function ProgressScreen({ progress, theme, onBack, onToggleTheme }: ProgressScreenProps) {
  const [expandedBadgeIds, setExpandedBadgeIds] = useState<string[]>([]);
  const practiceBlocks = groupPracticeBlocks(progress.sessionHistory);
  const totalPracticeMs = practiceBlocks.reduce((sum, block) => (
    sum + Math.max(0, new Date(block.endedAt).getTime() - new Date(block.startedAt).getTime())
  ), 0);
  const totalPhrases = practiceBlocks.reduce((sum, block) => sum + block.phraseCount, 0);
  const { weeks: consistencyStreakWeeks, thisWeekCount } = consistencyStreak(practiceBlocks);
  const blockLabels = blockLabelByProgressionId();

  const progressionSummaries: ProgressionSummary[] = buildProgressionMasterySummaries(progress)
    .map((summary) => ({
      ...summary,
      contentBlockLabel: blockLabels.get(summary.progression.id) ?? 'Custom content',
    }));

  const masteredProgressionCount = progressionSummaries.filter((summary) => summary.mastered).length;
  const contentBlockSummaries = CONTENT_BLOCKS.map((block) => {
    const summaries = block.progressionIds
      .map((progressionId) => progressionSummaries.find((summary) => summary.progression.id === progressionId))
      .filter((summary): summary is ProgressionSummary => Boolean(summary));
    const masteredCount = summaries.filter((summary) => summary.mastered).length;
    const attemptedCount = summaries.filter((summary) => summary.attempts > 0).length;

    return {
      block,
      summaries,
      total: summaries.length,
      masteredCount,
      attemptedCount,
      completionRatio: summaries.length > 0 ? masteredCount / summaries.length : 0,
    };
  });
  const completedCurriculaCount = contentBlockSummaries.filter((summary) => summary.masteredCount === summary.total).length;

  const weakestProgressions = progressionSummaries
    .filter((summary) => summary.attempts > 0 && !summary.mastered)
    .sort((a, b) => {
      if (a.recentAccuracy !== b.recentAccuracy) {
        return a.recentAccuracy - b.recentAccuracy;
      }
      return b.attempts - a.attempts;
    })
    .slice(0, 5);

  const biggestGains = progressionSummaries
    .filter((summary) => summary.attempts >= MASTERY_MIN_ATTEMPTS * 2 && summary.improvement !== null && summary.improvement > 0)
    .sort((a, b) => (b.improvement ?? 0) - (a.improvement ?? 0))
    .slice(0, 5);

  const weakestTransitions = Object.entries(progress.edgeMastery)
    .sort((a, b) => a[1].accuracyEwma - b[1].accuracyEwma)
    .slice(0, 4)
    .map(([transition, stat]) => ({
      id: transition,
      label: transitionLabel(transition),
      accuracy: stat.accuracyEwma,
      attempts: stat.attempts,
    }));

  const voicingSummaries = Object.entries(progress.nodeMastery)
    .reduce<Record<string, { sum: number; count: number }>>((result, [tokenId, stat]) => {
      const voicing = tokenId.split(':')[3] ?? 'unknown';
      result[voicing] ??= { sum: 0, count: 0 };
      result[voicing].sum += stat.accuracyEwma;
      result[voicing].count += 1;
      return result;
    }, {});
  const weakestVoicings = Object.entries(voicingSummaries)
    .map(([voicing, summary]) => ({
      voicing: humanizeSnakeCase(voicing),
      accuracy: summary.sum / Math.max(summary.count, 1),
      count: summary.count,
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 4);

  const toggleBadgeDetails = (blockId: string) => {
    setExpandedBadgeIds((current) => (
      current.includes(blockId)
        ? current.filter((id) => id !== blockId)
        : [...current, blockId]
    ));
  };

  return (
    <section className="progress-screen">
      <div className="progress-body">
        <header className="progress-header">
          <h1 className="progress-title">Practice Profile</h1>
          <div className="progress-header-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              onClick={onToggleTheme}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {theme === 'light' ? (
                  <path
                    d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : (
                  <>
                    <circle cx="12" cy="12" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <path
                      d="M12 2.6v2.3M12 19.1v2.3M21.4 12h-2.3M4.9 12H2.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </>
                )}
              </svg>
            </button>
            <button type="button" className="progress-quiet-button" onClick={onBack}>Back to Practice</button>
          </div>
        </header>

        <div className="progress-summary">
          <div className="progress-summary-item">
            <strong>{formatRelativeDate(progress.lastSessionAt)}</strong>
            <span>Last practice</span>
          </div>
          <div className="progress-summary-item">
            <strong>{formatDuration(totalPracticeMs)}</strong>
            <span>Total time · {totalPhrases} phrases</span>
          </div>
          <div className="progress-summary-item">
            <strong>{consistencyStreakWeeks} {consistencyStreakWeeks === 1 ? 'week' : 'weeks'}</strong>
            <span>Streak · {thisWeekCount} of {SESSIONS_PER_WEEK_TARGET} blocks this week</span>
          </div>
          <div className="progress-summary-item">
            <strong>{masteredProgressionCount} / {progressionSummaries.length}</strong>
            <span>Progressions mastered</span>
          </div>
          <div className="progress-summary-item">
            <strong>{completedCurriculaCount} / {contentBlockSummaries.length}</strong>
            <span>Content blocks completed</span>
          </div>
        </div>

        <p className="progress-lede">
          A progression is mastered when its last {MASTERY_MIN_ATTEMPTS} completed phrases average {pct(MASTERY_TARGET_ACCURACY)}
          {' '}or better; if that rolling average slips, mastery slips with it. Two practice blocks a week keep the streak alive.
        </p>

        <section className="progress-section">
          <div className="progress-section-heading">
            <h2>Content blocks</h2>
            <span className="progress-section-note">{completedCurriculaCount} of {contentBlockSummaries.length} fully mastered</span>
          </div>
          <div className="progress-block-list">
            {contentBlockSummaries.map((summary) => {
              const expanded = expandedBadgeIds.includes(summary.block.id);
              const complete = summary.masteredCount === summary.total;
              const status = complete ? 'Mastered' : summary.attemptedCount > 0 ? 'In progress' : 'Fresh';
              return (
                <div key={summary.block.id} className="progress-block">
                  <button
                    type="button"
                    className="progress-block-row"
                    aria-expanded={expanded}
                    onClick={() => toggleBadgeDetails(summary.block.id)}
                  >
                    <span className="progress-block-copy">
                      <strong>{summary.block.label}</strong>
                      <span>{summary.block.description}</span>
                    </span>
                    <span className="progress-block-status">
                      <span className={`progress-tag${complete ? ' is-mastered' : ''}`}>{status}</span>
                      <span className="progress-meter" aria-hidden="true">
                        <span style={{ width: `${Math.round(summary.completionRatio * 100)}%` }} />
                      </span>
                      <strong className="progress-number">{summary.masteredCount}/{summary.total}</strong>
                    </span>
                  </button>
                  {expanded ? (
                    <div className="progress-block-details">
                      {summary.summaries.map((progression) => (
                        <div key={progression.progression.id} className="progress-block-detail-row">
                          <span className="progress-list-copy">
                            <strong>{romanSummary(progression.progression)}</strong>
                            <span>{progressionSubtitle(progression.progression.id)}</span>
                          </span>
                          <span className="progress-block-detail-value">
                            {progression.mastered
                              ? <span className="progress-detail-state is-mastered">Mastered</span>
                              : progression.attempts > 0
                                ? <span className="progress-number">{progression.attempts} reps · {pct(progression.recentAccuracy)}</span>
                                : <span className="progress-detail-state">No reps yet</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="progress-section">
          <div className="progress-section-heading">
            <h2>Focus areas</h2>
          </div>
          <div className="progress-columns">
            <div className="progress-column">
              <h3>Slipping progressions</h3>
              <ul className="progress-list">
                {weakestProgressions.length === 0 ? <li className="progress-empty">No weak progressions right now.</li> : null}
                {weakestProgressions.map((summary) => (
                  <li key={summary.progression.id}>
                    <span className="progress-list-copy">
                      <strong>{romanSummary(summary.progression)}</strong>
                      <span>{summary.contentBlockLabel} · {progressionSubtitle(summary.progression.id)}</span>
                    </span>
                    <span className="progress-list-metrics">
                      <strong className="progress-number">{pct(summary.recentAccuracy)}</strong>
                      <span>{summary.attempts} reps</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="progress-column">
              <h3>Biggest jumps</h3>
              <ul className="progress-list">
                {biggestGains.length === 0 ? <li className="progress-empty">Not enough history yet to rank gains.</li> : null}
                {biggestGains.map((summary) => (
                  <li key={summary.progression.id}>
                    <span className="progress-list-copy">
                      <strong>{romanSummary(summary.progression)}</strong>
                      <span>{summary.contentBlockLabel} · {progressionSubtitle(summary.progression.id)}</span>
                    </span>
                    <span className="progress-list-metrics">
                      <strong className="progress-number is-good">{signedPoints(summary.improvement)}</strong>
                      <span>{summary.lastPracticedAt ? formatDate(summary.lastPracticedAt) : 'Recently'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="progress-column">
              <h3>Weakest transitions</h3>
              <ul className="progress-list">
                {weakestTransitions.length === 0 ? <li className="progress-empty">No transition data yet.</li> : null}
                {weakestTransitions.map((transition) => (
                  <li key={transition.id}>
                    <span className="progress-list-copy">
                      <strong>{transition.label}</strong>
                      <span>{transition.attempts} tracked attempts</span>
                    </span>
                    <span className="progress-list-metrics">
                      <strong className="progress-number">{pct(transition.accuracy)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="progress-column">
              <h3>Weakest voicings</h3>
              <ul className="progress-list">
                {weakestVoicings.length === 0 ? <li className="progress-empty">No voicing data yet.</li> : null}
                {weakestVoicings.map((voicing) => (
                  <li key={voicing.voicing}>
                    <span className="progress-list-copy">
                      <strong>{voicing.voicing}</strong>
                      <span>{voicing.count} tracked shapes</span>
                    </span>
                    <span className="progress-list-metrics">
                      <strong className="progress-number">{pct(voicing.accuracy)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="progress-section">
          <div className="progress-section-heading">
            <h2>Recent sessions</h2>
            {practiceBlocks.length > 0 ? (
              <span className="progress-section-note">Last {Math.min(practiceBlocks.length, 10)} practice blocks</span>
            ) : null}
          </div>
          {practiceBlocks.length === 0 ? (
            <p className="progress-empty">No practice history yet.</p>
          ) : (
            <table className="progress-session-table">
              <thead>
                <tr>
                  <th scope="col">Session</th>
                  <th scope="col" className="num">Phrases</th>
                  <th scope="col" className="num">Time</th>
                </tr>
              </thead>
              <tbody>
                {practiceBlocks.slice(-10).reverse().map((block) => {
                  const blockDurationMs = Math.max(0, new Date(block.endedAt).getTime() - new Date(block.startedAt).getTime());
                  return (
                    <tr key={`${block.id}:${block.endedAt}`}>
                      <td>
                        <span className="progress-session-copy">
                          <strong>{formatDateTime(block.endedAt)}</strong>
                          <span>{practiceBlockLabel(block)}</span>
                        </span>
                      </td>
                      <td className="num"><span className="progress-number">{block.phraseCount}</span></td>
                      <td className="num"><span className="progress-number">{formatDuration(blockDurationMs)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </section>
  );
}
