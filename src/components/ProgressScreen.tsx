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
import { ThemeToggle } from './ThemeToggle';

interface ProgressScreenProps {
  progress: ProgressState;
  theme: 'light' | 'dark' | 'focus';
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
  mode: 'guided' | 'improvisation';
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
    const mode = session.mode === 'improvisation' ? 'improvisation' : 'guided';
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
  const modeLabel = block.mode === 'improvisation' ? 'Improvisation' : 'Guided';
  return `${presetLabel ?? humanizeSnakeCase(block.lane)} · ${modeLabel}`;
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
    .map(([transition, stat]) => {
      const [fromTokenId, toTokenId] = transition.split('->');
      const fromRoman = fromTokenId?.split(':')[2] ?? 'Unknown';
      const toRoman = toTokenId?.split(':')[2] ?? 'Unknown';
      return {
        id: transition,
        label: `${fromRoman} -> ${toRoman}`,
        accuracy: stat.accuracyEwma,
        attempts: stat.attempts,
      };
    });

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
      <header className="progress-header">
        <div className="progress-header-copy">
          <span className="eyebrow">Progress</span>
          <h1>Track real practice, not noisy numbers.</h1>
          <p>
            The page now centers time on keys, consistency, mastery badges, and the exact progressions still worth drilling.
          </p>
        </div>
        <div className="progress-header-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button type="button" onClick={onBack}>Back to Practice</button>
        </div>
      </header>

      <section className="progress-hero">
        <div className="progress-hero-summary">
          <div>
            <span className="eyebrow">Last Practice</span>
            <strong>{formatRelativeDate(progress.lastSessionAt)}</strong>
          </div>
          <p>
            {progress.lastSessionAt
              ? `Most recent practice block ended ${formatDateTime(progress.lastSessionAt)}.`
              : 'Complete a phrase to start building your practice record.'}
          </p>
        </div>

        <div className="progress-stat-grid progress-stat-grid-clean">
          <article className="progress-stat-card accent-warm">
            <span className="eyebrow">Total Time Practiced</span>
            <strong>{formatDuration(totalPracticeMs)}</strong>
            <p>{totalPhrases} phrases completed</p>
          </article>

          <article className="progress-stat-card accent-cool">
            <span className="eyebrow">Consistency Streak</span>
            <strong>{consistencyStreakWeeks} {consistencyStreakWeeks === 1 ? 'week' : 'weeks'}</strong>
            <p>{thisWeekCount} of {SESSIONS_PER_WEEK_TARGET} practice blocks this week</p>
          </article>

          <article className="progress-stat-card accent-success">
            <span className="eyebrow">Mastered Progressions</span>
            <strong>{masteredProgressionCount} / {progressionSummaries.length}</strong>
            <p>Rolling {MASTERY_MIN_ATTEMPTS}-rep window at {pct(MASTERY_TARGET_ACCURACY)} or higher</p>
          </article>

          <article className="progress-stat-card accent-neutral">
            <span className="eyebrow">Curriculum Badges</span>
            <strong>{completedCurriculaCount} / {contentBlockSummaries.length}</strong>
            <p>Content blocks fully mastered</p>
          </article>
        </div>
      </section>

      <section className="progress-mastery-panel">
        <div className="progress-mastery-copy">
          <span className="eyebrow">How Mastery Works</span>
          <h2>Mastering a progression means clean repetition, not one lucky pass.</h2>
          <p>
            A progression counts as mastered once its {MASTERY_MIN_ATTEMPTS} most recent completed phrases average at least {pct(MASTERY_TARGET_ACCURACY)} accuracy.
            If that rolling average slips, the mastered badge slips too.
          </p>
        </div>
        <div className="progress-mastery-steps">
          <div>
            <strong>{MASTERY_MIN_ATTEMPTS} recent reps</strong>
            <span>Complete the same progression enough times to establish consistency.</span>
          </div>
          <div>
            <strong>{pct(MASTERY_TARGET_ACCURACY)} average accuracy</strong>
            <span>Hit the right voicings and transitions reliably, not occasionally.</span>
          </div>
          <div>
            <strong>2x per week keeps the streak</strong>
            <span>Practice at least two blocks each week to extend the consistency streak.</span>
          </div>
        </div>
      </section>

      <section className="progress-section">
        <div className="progress-section-heading">
          <div>
            <span className="eyebrow">Curriculum Mastery</span>
            <h2>Badge the library block by block.</h2>
          </div>
          <p>{completedCurriculaCount} of {contentBlockSummaries.length} content blocks fully mastered.</p>
        </div>
        <div className="progress-badge-grid">
          {contentBlockSummaries.map((summary) => (
            <button
              type="button"
              key={summary.block.id}
              className={`progress-badge-card ${summary.masteredCount === summary.total ? 'complete' : summary.attemptedCount > 0 ? 'active' : 'fresh'} ${expandedBadgeIds.includes(summary.block.id) ? 'expanded' : ''}`.trim()}
              aria-expanded={expandedBadgeIds.includes(summary.block.id)}
              onClick={() => toggleBadgeDetails(summary.block.id)}
            >
              <div className="progress-badge-topline">
                <span className="eyebrow">{summary.masteredCount === summary.total ? 'Mastered' : summary.attemptedCount > 0 ? 'In Progress' : 'Fresh'}</span>
                <strong>{summary.masteredCount}/{summary.total}</strong>
              </div>
              <h3>{summary.block.label}</h3>
              <p>{summary.block.description}</p>
              <div className="progress-badge-meter" aria-hidden="true">
                <span style={{ width: `${summary.completionRatio * 100}%` }} />
              </div>
              <div className="progress-badge-meta">
                <span>{summary.attemptedCount} attempted</span>
                <span>{expandedBadgeIds.includes(summary.block.id) ? 'Hide details' : `${summary.masteredCount} mastered`}</span>
              </div>
              {expandedBadgeIds.includes(summary.block.id) ? (
                <div className="progress-badge-details">
                  {summary.summaries.map((progression) => (
                    <div
                      key={progression.progression.id}
                      className={`progress-subbadge ${progression.mastered ? 'mastered' : progression.attempts > 0 ? 'attempted' : 'fresh'}`.trim()}
                    >
                      <div className="progress-subbadge-topline">
                        <strong>{progressionSubtitle(progression.progression.id)}</strong>
                        <span>{progression.mastered ? 'Mastered' : progression.attempts > 0 ? 'In Progress' : 'Fresh'}</span>
                      </div>
                      <span>{progressionRomanSummary(progression.progression)}</span>
                      <span>
                        {progression.attempts > 0
                          ? `${progression.attempts} reps · ${pct(progression.recentAccuracy)} recent accuracy`
                          : 'No reps yet'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <section className="progress-detail-grid progress-detail-grid-clean">
        <article className="progress-panel">
          <div className="progress-panel-heading">
            <div>
              <span className="eyebrow">Target Next</span>
              <h2>Progressions still slipping</h2>
            </div>
          </div>
          <ul className="progress-rank-list">
            {weakestProgressions.length === 0 ? <li className="progress-empty">No weak progressions right now.</li> : null}
            {weakestProgressions.map((summary) => (
              <li key={summary.progression.id}>
                <div>
                  <strong>{progressionRomanSummary(summary.progression)}</strong>
                  <span>{summary.contentBlockLabel} · {progressionSubtitle(summary.progression.id)}</span>
                </div>
                <div className="progress-rank-metrics">
                  <strong>{pct(summary.recentAccuracy)}</strong>
                  <span>{summary.attempts} reps</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="progress-panel">
          <div className="progress-panel-heading">
            <div>
              <span className="eyebrow">Relish The Gain</span>
              <h2>Biggest recent jumps</h2>
            </div>
          </div>
          <ul className="progress-rank-list">
            {biggestGains.length === 0 ? <li className="progress-empty">Not enough history yet to rank gains.</li> : null}
            {biggestGains.map((summary) => (
              <li key={summary.progression.id}>
                <div>
                  <strong>{progressionRomanSummary(summary.progression)}</strong>
                  <span>{summary.contentBlockLabel} · {progressionSubtitle(summary.progression.id)}</span>
                </div>
                <div className="progress-rank-metrics positive">
                  <strong>{signedPoints(summary.improvement)}</strong>
                  <span>{summary.lastPracticedAt ? formatDate(summary.lastPracticedAt) : 'Recently'}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="progress-panel">
          <div className="progress-panel-heading">
            <div>
              <span className="eyebrow">Weak Spots</span>
              <h2>Transitions and voicings</h2>
            </div>
          </div>
          <div className="progress-subpanel-grid">
            <div>
              <h3>Weakest transitions</h3>
              <ul className="progress-rank-list compact">
                {weakestTransitions.length === 0 ? <li className="progress-empty">No transition data yet.</li> : null}
                {weakestTransitions.map((transition) => (
                  <li key={transition.id}>
                    <div>
                      <strong>{transition.label}</strong>
                      <span>{transition.attempts} tracked attempts</span>
                    </div>
                    <div className="progress-rank-metrics">
                      <strong>{pct(transition.accuracy)}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Weakest voicings</h3>
              <ul className="progress-rank-list compact">
                {weakestVoicings.length === 0 ? <li className="progress-empty">No voicing data yet.</li> : null}
                {weakestVoicings.map((voicing) => (
                  <li key={voicing.voicing}>
                    <div>
                      <strong>{voicing.voicing}</strong>
                      <span>{voicing.count} tracked shapes</span>
                    </div>
                    <div className="progress-rank-metrics">
                      <strong>{pct(voicing.accuracy)}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </section>

      <article className="progress-panel progress-session-panel">
        <div className="progress-panel-heading">
          <div>
            <span className="eyebrow">Practice Log</span>
            <h2>Recent practice blocks</h2>
          </div>
        </div>
        <ul className="progress-session-list clean">
          {practiceBlocks.length === 0 ? <li className="progress-empty">No practice history yet.</li> : null}
          {practiceBlocks.slice(-10).reverse().map((block) => {
            const blockDurationMs = Math.max(0, new Date(block.endedAt).getTime() - new Date(block.startedAt).getTime());
            return (
              <li key={`${block.id}:${block.endedAt}`}>
                <div>
                  <strong>{formatDateTime(block.endedAt)}</strong>
                  <span>{practiceBlockLabel(block)}</span>
                </div>
                <div>
                  <strong>{block.phraseCount}</strong>
                  <span>phrases</span>
                </div>
                <div>
                  <strong>{formatDuration(blockDurationMs)}</strong>
                  <span>practice time</span>
                </div>
              </li>
            );
          })}
        </ul>
      </article>
    </section>
  );
}
