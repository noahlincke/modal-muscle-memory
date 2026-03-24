import { PROGRESSION_LIBRARY } from '../content/progressions';
import type { ProgressionDefinition, VoicingFamily } from '../types/music';
import type { ProgressState } from '../types/progress';

interface PhraseIdMetadata {
  progressionId: string;
  tonic: string;
  voicingFamily: VoicingFamily;
}

interface ProgressionHistoryEntry {
  accuracy: number;
  endedAt: string;
}

export interface ProgressionMasterySummary {
  progression: ProgressionDefinition;
  attempts: number;
  recentAccuracy: number;
  improvement: number | null;
  mastered: boolean;
  lastPracticedAt: string | null;
}

export const MASTERY_MIN_ATTEMPTS = 3;
export const MASTERY_TARGET_ACCURACY = 0.9;

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parsePhraseIdMetadata(phraseId: string): PhraseIdMetadata | null {
  const parts = phraseId.split(':');
  if (parts.length < 7) {
    return null;
  }

  const progressionId = parts[4];
  const tonic = parts[5];
  const voicingFamily = parts[6] as VoicingFamily;
  if (!progressionId || !tonic || !voicingFamily) {
    return null;
  }

  return { progressionId, tonic, voicingFamily };
}

export function buildProgressionMasterySummaries(
  progress: ProgressState,
  progressions: ProgressionDefinition[] = PROGRESSION_LIBRARY,
): ProgressionMasterySummary[] {
  const progressionHistory = progress.sessionHistory.reduce<Record<string, ProgressionHistoryEntry[]>>((result, session) => {
    session.phraseIds.forEach((phraseId) => {
      const parsed = parsePhraseIdMetadata(phraseId);
      if (!parsed) {
        return;
      }

      result[parsed.progressionId] ??= [];
      result[parsed.progressionId].push({
        accuracy: session.accuracy,
        endedAt: session.endedAt,
      });
    });

    return result;
  }, {});

  return progressions.map((progression) => {
    const history = (progressionHistory[progression.id] ?? [])
      .sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime());
    const recent = history.slice(-MASTERY_MIN_ATTEMPTS);
    const previous = history.slice(-(MASTERY_MIN_ATTEMPTS * 2), -MASTERY_MIN_ATTEMPTS);
    const recentAccuracy = recent.length > 0 ? average(recent.map((entry) => entry.accuracy)) : 0;
    const previousAccuracy = previous.length > 0 ? average(previous.map((entry) => entry.accuracy)) : null;

    return {
      progression,
      attempts: history.length,
      recentAccuracy,
      improvement: previousAccuracy === null ? null : recentAccuracy - previousAccuracy,
      mastered: history.length >= MASTERY_MIN_ATTEMPTS && recentAccuracy >= MASTERY_TARGET_ACCURACY,
      lastPracticedAt: history[history.length - 1]?.endedAt ?? null,
    };
  });
}
