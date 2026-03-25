import { getContentBlock } from '../../content/curriculum';
import { circleDistance, rootsForKeySet } from '../../content/keys';
import { PROGRESSION_LIBRARY } from '../../content/progressions';
import { RHYTHM_CELLS } from '../../content/rhythmCells';
import { scaleFamilyForScaleId } from '../../content/scales';
import type {
  Phrase,
  PhraseFocusType,
  ProgressionDefinition,
  ProgressionFamilyTag,
  RhythmCellId,
  ScaleFamilyId,
  VoicingFamily,
} from '../../types/music';
import type { ExerciseConfig, ProgressState, UnlockState } from '../../types/progress';
import { buildChordToken } from '../theory/chordToken';
import { choosePhraseFocus } from './scheduler';
import { orderedVoicingFamilies, VOICING_FAMILIES_IN_ORDER } from '../voicingFamilies';

interface GeneratePhraseInput {
  config: ExerciseConfig;
  progress: ProgressState;
  tempo: number;
  previousPhrase?: Phrase | null;
  random?: () => number;
  midiRange?: { min: number; max: number };
  focusOverride?: PhraseFocusType;
  tonicOverride?: string;
  progressionOverrideId?: string;
  voicingFamilyOverride?: VoicingFamily;
}

function choose<T>(items: T[], random: () => number): T {
  const index = Math.floor(random() * items.length);
  return items[Math.min(index, items.length - 1)];
}

function chooseWeighted<T>(
  items: Array<{ value: T; weight: number }>,
  random: () => number,
): T {
  const eligible = items.filter((item) => item.weight > 0);
  if (eligible.length === 0) {
    return items[0].value;
  }

  const totalWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * totalWeight;

  for (const item of eligible) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item.value;
    }
  }

  return eligible[eligible.length - 1].value;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function parseRomanFromTokenId(tokenId: string): string | null {
  const parts = tokenId.split(':');
  return parts.length >= 3 ? parts[2] : null;
}

interface PhraseIdMetadata {
  progressionId: string;
  tonic: string;
  voicingFamily: VoicingFamily;
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

  return {
    progressionId,
    tonic,
    voicingFamily,
  };
}

function pickProgressionForFocus(
  progressions: ProgressionDefinition[],
  focus: PhraseFocusType,
  progress: ProgressState,
  random: () => number,
): ProgressionDefinition {
  if (focus === 'weak_node') {
    const weakNode = Object.entries(progress.nodeMastery)
      .filter(([, stat]) => stat.attempts > 1)
      .sort((a, b) => a[1].accuracyEwma - b[1].accuracyEwma)[0];

    const weakRoman = weakNode ? parseRomanFromTokenId(weakNode[0]) : null;
    if (weakRoman) {
      const matching = progressions.filter((progression) => progression.steps.some((step) => step.roman === weakRoman));
      if (matching.length > 0) return choose(matching, random);
    }
  }

  if (focus === 'weak_transition') {
    const weakestEdge = Object.entries(progress.edgeMastery)
      .sort((a, b) => a[1].accuracyEwma - b[1].accuracyEwma)[0];

    if (weakestEdge) {
      const [fromTokenId, toTokenId] = weakestEdge[0].split('->');
      const fromRoman = parseRomanFromTokenId(fromTokenId);
      const toRoman = parseRomanFromTokenId(toTokenId);
      if (fromRoman && toRoman) {
        const matching = progressions.filter((progression) => {
          for (let i = 0; i < progression.steps.length - 1; i += 1) {
            if (progression.steps[i].roman === fromRoman && progression.steps[i + 1].roman === toRoman) {
              return true;
            }
          }
          return false;
        });
        if (matching.length > 0) return choose(matching, random);
      }
    }
  }

  if (focus === 'new_item') {
    const byDifficulty = [...progressions].sort((a, b) => b.difficulty - a.difficulty);
    return byDifficulty[0];
  }

  if (focus === 'due_review') {
    const lowDifficulty = [...progressions].sort((a, b) => a.difficulty - b.difficulty);
    return choose(lowDifficulty.slice(0, Math.max(1, Math.floor(lowDifficulty.length / 2))), random);
  }

  return choose(progressions, random);
}

function isChainedImprovisation(config: ExerciseConfig): boolean {
  return config.mode === 'improvisation' && config.improvisationProgressionMode === 'chained';
}

function isGuidedChaining(config: ExerciseConfig): boolean {
  return config.mode === 'guided' && config.guidedFlowMode === 'musical_chaining';
}

function isImprovementFlow(config: ExerciseConfig): boolean {
  return (config.mode === 'guided' && config.guidedFlowMode === 'targeting_improvement')
    || (config.mode === 'improvisation' && config.improvisationProgressionMode === 'targeting_improvement');
}

function isRandomFlow(config: ExerciseConfig): boolean {
  return (config.mode === 'guided' && config.guidedFlowMode === 'random')
    || (config.mode === 'improvisation' && config.improvisationProgressionMode === 'random');
}

interface ImprovementTarget {
  progression: ProgressionDefinition;
  tonic: string;
  voicingFamily: VoicingFamily;
}

const RECENT_PROGRESSION_WINDOW = 8;
const LOOP_ESCAPE_WINDOW = 6;
const LOOP_ESCAPE_UNIQUE_MAX = 3;

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function progressionLookup(progressions: ProgressionDefinition[]): Map<string, ProgressionDefinition> {
  return new Map(progressions.map((progression) => [progression.id, progression]));
}

function recentProgressionIds(
  progressions: ProgressionDefinition[],
  progress: ProgressState,
  previousPhrase: Phrase | null | undefined,
): string[] {
  const allowedIds = new Set(progressions.map((progression) => progression.id));
  const phraseIds = progress.sessionHistory
    .flatMap((session) => session.phraseIds)
    .slice(-(RECENT_PROGRESSION_WINDOW + LOOP_ESCAPE_WINDOW));
  const recentIds = phraseIds.reduce<string[]>((acc, phraseId) => {
    const progressionId = parsePhraseIdMetadata(phraseId)?.progressionId;
    if (progressionId && allowedIds.has(progressionId)) {
      acc.push(progressionId);
    }
    return acc;
  }, []);

  if (previousPhrase && allowedIds.has(previousPhrase.progressionId)) {
    recentIds.push(previousPhrase.progressionId);
  }

  return recentIds.slice(-(RECENT_PROGRESSION_WINDOW + LOOP_ESCAPE_WINDOW));
}

function trappedLoopSet(
  progressions: ProgressionDefinition[],
  recentIds: string[],
): Set<string> | null {
  const recentWindow = recentIds.slice(-LOOP_ESCAPE_WINDOW);
  if (recentWindow.length < LOOP_ESCAPE_WINDOW) {
    return null;
  }

  const uniqueRecent = unique(recentWindow);
  if (uniqueRecent.length > LOOP_ESCAPE_UNIQUE_MAX || uniqueRecent.length >= progressions.length) {
    return null;
  }

  const trapped = new Set(uniqueRecent);
  const hasEscapeOption = progressions.some((progression) => !trapped.has(progression.id));
  return hasEscapeOption ? trapped : null;
}

function chainedSelectionPool(
  progressions: ProgressionDefinition[],
  previousPhrase: Phrase | null | undefined,
): ProgressionDefinition[] {
  if (!previousPhrase) {
    return progressions;
  }

  const previousProgression = progressions.find((progression) => progression.id === previousPhrase.progressionId);
  if (!previousProgression) {
    return progressions;
  }

  const byId = progressionLookup(progressions);
  const directTargets = previousProgression.chainTargets
    .map((targetId) => byId.get(targetId))
    .filter((progression): progression is ProgressionDefinition => Boolean(progression));

  return unique([previousProgression, ...directTargets]);
}

function pickProgressionWithNovelty(
  selectionPool: ProgressionDefinition[],
  progressions: ProgressionDefinition[],
  preferredProgression: ProgressionDefinition,
  recentIds: string[],
  chainMovement: number,
  random: () => number,
): ProgressionDefinition {
  const movement = clampUnit(chainMovement / 100);
  const trapped = trappedLoopSet(progressions, recentIds);
  const recentWindow = recentIds.slice(-RECENT_PROGRESSION_WINDOW);
  const immediateLastId = recentIds[recentIds.length - 1] ?? null;

  if (trapped && movement >= 0.45) {
    const escapeOptions = progressions.filter((progression) => !trapped.has(progression.id));
    if (escapeOptions.length > 0) {
      return chooseWeighted(
        escapeOptions.map((progression) => ({
          value: progression,
          weight: progression.id === preferredProgression.id
            ? 2.8 + movement
            : 1 + (movement * 1.4),
        })),
        random,
      );
    }
  }

  return chooseWeighted(
    selectionPool.map((progression) => {
      let weight = progression.id === preferredProgression.id
        ? 4.2 - (movement * 2.1)
        : 0.9 + (movement * 0.45);

      const recencyScore = recentWindow
        .slice()
        .reverse()
        .reduce((score, recentId, index) => (
          recentId === progression.id
            ? score + (1 / (index + 1))
            : score
        ), 0);

      if (recencyScore > 0) {
        weight *= 1 - (movement * Math.min(0.8, recencyScore * 0.32));
      }

      if (movement >= 0.25 && immediateLastId === progression.id && progressions.length > 1) {
        weight *= 1 - (movement * 0.72);
      }

      if (trapped) {
        if (trapped.has(progression.id)) {
          weight *= 1 - (movement * 0.65);
        } else {
          weight *= 1 + (movement * 1.1);
        }
      }

      return {
        value: progression,
        weight,
      };
    }),
    random,
  );
}

function chooseChainedTonic(
  allowedRoots: string[],
  currentTonic: string,
  chainMovement: number,
  random: () => number,
): string {
  if (allowedRoots.length === 0) {
    return currentTonic;
  }

  if (!allowedRoots.includes(currentTonic)) {
    return choose(allowedRoots, random);
  }

  if (allowedRoots.length === 1) {
    return currentTonic;
  }

  const movement = clampUnit(chainMovement / 100);

  return chooseWeighted(
    allowedRoots.map((root) => {
      const distance = circleDistance(currentTonic, root);

      if (distance === 0) {
        let weight = 5 - (movement * 4.2);
        if (movement >= 0.8) {
          weight *= 0.42;
        }
        return { value: root, weight };
      }

      let weight = (0.18 + (movement * 2.6)) / distance;
      if (distance === 1) {
        weight += movement * 1.15;
      } else if (distance === 2) {
        weight += Math.max(0, movement - 0.35) * 0.95;
      } else if (movement < 0.7) {
        weight *= 0.18;
      }

      return { value: root, weight };
    }),
    random,
  );
}

function pickChainedProgression(
  progressions: ProgressionDefinition[],
  previousPhrase: Phrase | null | undefined,
  chainMovement: number,
  random: () => number,
): ProgressionDefinition | null {
  if (!previousPhrase) {
    return null;
  }

  const previousProgression = progressions.find((progression) => progression.id === previousPhrase.progressionId);
  if (!previousProgression) {
    return null;
  }

  const byId = progressionLookup(progressions);
  const directTargets = previousProgression.chainTargets
    .map((targetId) => byId.get(targetId))
    .filter((progression): progression is ProgressionDefinition => Boolean(progression));

  if (directTargets.length === 0) {
    return previousProgression;
  }

  const movement = clampUnit(chainMovement / 100);
  const primaryTargetId = previousProgression.chainTargets[0] ?? null;

  return chooseWeighted(
    [
      {
        value: previousProgression,
        weight: 3.8 - (3.4 * movement),
      },
      ...directTargets.map((progression) => ({
        value: progression,
        weight: progression.id === primaryTargetId
          ? 1.3 + ((1 - movement) * 0.9)
          : 0.65 + (movement * 1.8),
      })),
    ],
    random,
  );
}

function pickImprovementTarget(
  config: ExerciseConfig,
  progressions: ProgressionDefinition[],
  progress: ProgressState,
  availableRoots: string[],
  unlocked: UnlockState,
  activeVoicings: Set<VoicingFamily>,
  chainMovement: number,
  random: () => number,
): ImprovementTarget | null {
  const byId = progressionLookup(progressions);
  const allowedRoots = new Set(availableRoots);
  const rankedTargets = [...progress.sessionHistory]
    .slice(-24)
    .flatMap((session) => session.phraseIds.map((phraseId) => ({
      phraseId,
      accuracy: session.accuracy,
      endedAt: session.endedAt,
    })))
    .map((entry) => {
      const parsed = parsePhraseIdMetadata(entry.phraseId);
      if (!parsed) {
        return null;
      }

      const progression = byId.get(parsed.progressionId);
      if (!progression) {
        return null;
      }

      if (!allowedRoots.has(parsed.tonic)) {
        return null;
      }

      if (
        !voicingAvailableInMode(config, unlocked, activeVoicings, parsed.voicingFamily)
        || !progressionVoicingPool(config, progression, unlocked, activeVoicings).includes(parsed.voicingFamily)
      ) {
        return null;
      }

      return {
        progression,
        tonic: parsed.tonic,
        voicingFamily: parsed.voicingFamily,
        accuracy: entry.accuracy,
        endedAt: entry.endedAt,
      };
    })
    .filter((target): target is ImprovementTarget & { accuracy: number; endedAt: string } => Boolean(target))
    .sort((a, b) => {
      if (a.accuracy !== b.accuracy) {
        return a.accuracy - b.accuracy;
      }

      return new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime();
    });

  if (rankedTargets.length === 0) {
    return null;
  }

  const movement = clampUnit(chainMovement / 100);
  const candidateCount = Math.max(
    1,
    Math.min(
      rankedTargets.length,
      1 + Math.round(movement * Math.min(4, rankedTargets.length - 1)),
    ),
  );
  const candidates = rankedTargets.slice(0, candidateCount);

  return chooseWeighted(
    candidates.map((candidate, index) => ({
      value: candidate,
      weight: (candidateCount - index) + ((1 - movement) * 2.5),
    })),
    random,
  );
}

function voicingMastery(progress: ProgressState, voicingFamily: VoicingFamily): {
  attempts: number;
  accuracy: number;
} {
  const stats = Object.entries(progress.nodeMastery)
    .filter(([tokenId, stat]) => tokenId.includes(`:${voicingFamily}:`) && stat.attempts > 0)
    .map(([, stat]) => stat);

  if (stats.length === 0) {
    return {
      attempts: 0,
      accuracy: 0,
    };
  }

  const attempts = stats.reduce((sum, stat) => sum + stat.attempts, 0);
  const accuracy = stats.reduce((sum, stat) => sum + stat.accuracyEwma, 0) / stats.length;

  return {
    attempts,
    accuracy,
  };
}

function autoVoicingChoices(
  progress: ProgressState,
  unlocked: UnlockState,
): Array<{ value: VoicingFamily; weight: number }> {
  const unlockedPath = VOICING_FAMILIES_IN_ORDER.filter((voicing) => unlocked.voicings.includes(voicing));
  if (unlockedPath.length === 0) {
    return [];
  }

  const currentIndex = unlockedPath.findIndex((voicing) => {
    const mastery = voicingMastery(progress, voicing);
    return mastery.attempts < 8 || mastery.accuracy < 0.86;
  });
  const resolvedIndex = currentIndex >= 0 ? currentIndex : unlockedPath.length - 1;
  const current = unlockedPath[resolvedIndex];
  const next = unlockedPath[resolvedIndex + 1] ?? null;
  const currentMastery = voicingMastery(progress, current);

  if (!next) {
    return [{ value: current, weight: 1 }];
  }

  if (currentMastery.attempts >= 16 && currentMastery.accuracy >= 0.93) {
    return [
      { value: current, weight: 1.2 },
      { value: next, weight: 1.2 },
    ];
  }

  if (currentMastery.attempts >= 8 && currentMastery.accuracy >= 0.86) {
    return [
      { value: current, weight: 2.4 },
      { value: next, weight: 1 },
    ];
  }

  return [{ value: current, weight: 1 }];
}

function voicingAvailableInMode(
  config: ExerciseConfig,
  unlocked: UnlockState,
  activeVoicings: Set<VoicingFamily>,
  voicingFamily: VoicingFamily,
): boolean {
  if (!activeVoicings.has(voicingFamily)) {
    return false;
  }

  return config.voicingPracticeMode === 'custom'
    ? true
    : unlocked.voicings.includes(voicingFamily);
}

function progressionVoicingPool(
  config: ExerciseConfig,
  progression: ProgressionDefinition,
  unlocked: UnlockState,
  activeVoicings: Set<VoicingFamily>,
): VoicingFamily[] {
  const candidates = config.voicingPracticeMode === 'custom'
    ? orderedVoicingFamilies([...activeVoicings])
    : progression.allowedVoicings;

  return candidates.filter((voicing) =>
    voicingAvailableInMode(config, unlocked, activeVoicings, voicing),
  );
}

function activeVoicingPool(
  config: ExerciseConfig,
  progress: ProgressState,
  unlocked: UnlockState,
  progressions: ProgressionDefinition[] = [],
): VoicingFamily[] {
  if (config.voicingPracticeMode === 'custom') {
    const selected = orderedVoicingFamilies(config.selectedVoicings);
    if (selected.length > 0) {
      return selected;
    }

    return [];
  }

  const autoPool = autoVoicingChoices(progress, unlocked).map((item) => item.value);
  if (
    progressions.length === 0
    || progressions.some((progression) => progressionSupportsVoicingPool(
      config,
      progression,
      unlocked,
      new Set(autoPool),
    ))
  ) {
    return autoPool;
  }

  return orderedVoicingFamilies(
    progressions.flatMap((progression) =>
      progression.allowedVoicings.filter((voicing) => unlocked.voicings.includes(voicing)),
    ),
  ).slice(0, 1);
}

function progressionSupportsVoicingPool(
  config: ExerciseConfig,
  progression: ProgressionDefinition,
  unlocked: UnlockState,
  activeVoicings: Set<VoicingFamily>,
): boolean {
  return progressionVoicingPool(config, progression, unlocked, activeVoicings).length > 0;
}

function selectVoicing(
  config: ExerciseConfig,
  progress: ProgressState,
  unlocked: UnlockState,
  progression: ProgressionDefinition,
  focus: PhraseFocusType,
  random: () => number,
): VoicingFamily {
  const activeVoicings = new Set(activeVoicingPool(config, progress, unlocked, [progression]));
  const available = progressionVoicingPool(config, progression, unlocked, activeVoicings);
  if (available.length === 0) {
    return config.voicingPracticeMode === 'custom'
      ? (activeVoicings.values().next().value ?? progression.allowedVoicings[0])
      : progression.allowedVoicings[0];
  }

  if (config.voicingPracticeMode === 'custom') {
    return choose(available, random);
  }

  const weightedAutoChoices = autoVoicingChoices(progress, unlocked)
    .filter((choice) => available.includes(choice.value));
  if (weightedAutoChoices.length > 0) {
    return chooseWeighted(weightedAutoChoices, random);
  }

  if (focus === 'new_item' && available.includes('inversion_1')) {
    return 'inversion_1';
  }

  return choose(available, random);
}

function selectRhythm(
  selectedRhythm: ExerciseConfig['rhythm'],
  requested: RhythmCellId,
  minOffsetBeats: number,
  random: () => number,
): RhythmCellId {
  const allRhythms = Object.keys(RHYTHM_CELLS) as RhythmCellId[];
  const selectedPool = selectedRhythm.includes('all')
    ? allRhythms
    : selectedRhythm.filter((rhythm): rhythm is RhythmCellId => rhythm !== 'all' && allRhythms.includes(rhythm));

  const compatiblePool = selectedPool.filter((rhythmId) => {
    const rhythmCell = RHYTHM_CELLS[rhythmId];
    const firstOffset = Math.min(...rhythmCell.hits.map((hit) => hit.offsetBeats));
    return firstOffset >= minOffsetBeats;
  });

  if (compatiblePool.includes(requested)) {
    return requested;
  }

  if (compatiblePool.length > 0) {
    return choose(compatiblePool, random);
  }

  if (selectedPool.includes(requested)) {
    return requested;
  }

  if (selectedPool.length > 0) {
    return choose(selectedPool, random);
  }

  const fallback = allRhythms.filter((rhythm) =>
    ['block_whole', 'halves', 'quarters', 'charleston'].includes(rhythm),
  );

  return fallback.length > 0 ? choose(fallback, random) : 'block_whole';
}

function progressionScaleFamilyIds(progression: ProgressionDefinition): ScaleFamilyId[] {
  return unique(
    progression.steps.flatMap((step) => [
      ...step.recommendedScaleIds.map(scaleFamilyForScaleId),
      ...step.colorScaleIds.map(scaleFamilyForScaleId),
    ]),
  );
}

function progressionMatchesFamilies(
  progression: ProgressionDefinition,
  enabledScaleFamilyIds: ScaleFamilyId[],
  enabledProgressionFamilyTags: ProgressionFamilyTag[],
): boolean {
  const scaleFamilyMatch = enabledScaleFamilyIds.length > 0
    && progressionScaleFamilyIds(progression).some((familyId) => enabledScaleFamilyIds.includes(familyId));
  const progressionFamilyMatch = enabledProgressionFamilyTags.length > 0
    && progression.tags.families.some((family) => enabledProgressionFamilyTags.includes(family));

  return scaleFamilyMatch && progressionFamilyMatch;
}

function progressionsForContentBlocks(blockIds: ExerciseConfig['enabledContentBlockIds']): ProgressionDefinition[] {
  if (blockIds.length === 0) {
    return [];
  }

  const ids = unique(blockIds.flatMap((blockId) => getContentBlock(blockId)?.progressionIds ?? []));
  const allowed = new Set(ids);
  return PROGRESSION_LIBRARY.filter((progression) => allowed.has(progression.id));
}

function queryProgressions(config: ExerciseConfig): ProgressionDefinition[] {
  return progressionsForContentBlocks(config.enabledContentBlockIds).filter((progression) => progressionMatchesFamilies(
    progression,
    config.enabledScaleFamilyIds,
    config.enabledProgressionFamilyTags,
  ));
}

function playableProgressions(config: ExerciseConfig, progress: ProgressState): ProgressionDefinition[] {
  const unlocked = aggregateUnlockState(progress);
  const baseProgressions = queryProgressions(config);
  const activeVoicings = new Set(activeVoicingPool(config, progress, unlocked, baseProgressions));

  return baseProgressions.filter((progression) =>
    progressionSupportsVoicingPool(config, progression, unlocked, activeVoicings),
  );
}

export function matchingProgressionIds(config: ExerciseConfig): string[] {
  return queryProgressions(config).map((progression) => progression.id);
}

export function playableProgressionIds(config: ExerciseConfig, progress: ProgressState): string[] {
  return playableProgressions(config, progress).map((progression) => progression.id);
}

export function countMatchingProgressions(config: ExerciseConfig): number {
  return matchingProgressionIds(config).length;
}

export function activeVoicingFamiliesForPractice(progress: ProgressState): VoicingFamily[] {
  const unlocked = aggregateUnlockState(progress);
  return activeVoicingPool(
    progress.exerciseConfig,
    progress,
    unlocked,
    queryProgressions(progress.exerciseConfig),
  );
}

function aggregateUnlockState(progress: ProgressState): UnlockState {
  const allUnlocks = Object.values(progress.unlocksByLane);
  return {
    roots: unique(allUnlocks.flatMap((unlock) => unlock.roots)),
    modes: unique(allUnlocks.flatMap((unlock) => unlock.modes)),
    voicings: unique(allUnlocks.flatMap((unlock) => unlock.voicings)),
    rhythms: unique(allUnlocks.flatMap((unlock) => unlock.rhythms)),
    borrowedDepth: Math.max(...allUnlocks.map((unlock) => unlock.borrowedDepth), 0),
    unlockedPackIds: unique(allUnlocks.flatMap((unlock) => unlock.unlockedPackIds)),
  };
}

export function generatePhrase({
  config,
  progress,
  tempo,
  previousPhrase,
  random = Math.random,
  midiRange,
  focusOverride,
  tonicOverride,
  progressionOverrideId,
  voicingFamilyOverride,
}: GeneratePhraseInput): Phrase {
  const unlocked = aggregateUnlockState(progress);
  const baseProgressions = playableProgressions(config, progress);
  const activeVoicings = new Set(activeVoicingPool(config, progress, unlocked, baseProgressions));
  const progressions = baseProgressions.filter((progression) =>
    progressionSupportsVoicingPool(config, progression, unlocked, activeVoicings),
  );
  if (progressions.length === 0) {
    throw new Error('No progressions match the current practice filter.');
  }

  const roots = rootsForKeySet(config.keySet);

  const focus = focusOverride ?? choosePhraseFocus({
    progress,
    difficulty: 1,
    random,
  });

  const chainSource = (isChainedImprovisation(config) || isGuidedChaining(config))
    ? previousPhrase
    : null;
  const improvementTarget = isImprovementFlow(config)
    ? pickImprovementTarget(
      config,
      progressions,
      progress,
      roots,
      unlocked,
      activeVoicings,
      config.chainMovement,
      random,
    )
    : null;
  const preferredProgression = (progressionOverrideId
    ? progressions.find((progression) => progression.id === progressionOverrideId) ?? null
    : null)
    ?? pickChainedProgression(progressions, chainSource, config.chainMovement, random)
    ?? improvementTarget?.progression
    ?? (isRandomFlow(config) ? choose(progressions, random) : pickProgressionForFocus(progressions, focus, progress, random));
  const selectionPool = chainSource ? chainedSelectionPool(progressions, chainSource) : progressions;
  const progression = pickProgressionWithNovelty(
    selectionPool,
    progressions,
    preferredProgression,
    recentProgressionIds(progressions, progress, previousPhrase),
    config.chainMovement,
    random,
  );
  const lane = progression.lane;
  const tonic = tonicOverride
    ?? (chainSource
      ? chooseChainedTonic(roots, chainSource.tonic, config.chainMovement, random)
      : null)
    ?? improvementTarget?.tonic
    ?? (roots.length > 0 ? choose(roots, random) : 'C');
  const previousPhraseLastEvent = chainSource ? chainSource.events[chainSource.events.length - 1] : null;
  const previousPhraseLastToken = previousPhraseLastEvent
    ? chainSource?.tokensById[previousPhraseLastEvent.chordTokenId]
    : null;
  const progressionVoicings = progressionVoicingPool(config, progression, unlocked, activeVoicings);
  const carryForwardVoicingFamily = previousPhraseLastToken
    && voicingAvailableInMode(config, unlocked, activeVoicings, previousPhraseLastToken.voicingFamily)
    && progressionVoicings.includes(previousPhraseLastToken.voicingFamily)
    ? previousPhraseLastToken.voicingFamily
    : null;
  const voicingFamily = carryForwardVoicingFamily
    ?? (voicingFamilyOverride
      && voicingAvailableInMode(config, unlocked, activeVoicings, voicingFamilyOverride)
      && progressionVoicings.includes(voicingFamilyOverride)
      ? voicingFamilyOverride
      : null)
    ?? (improvementTarget
      && progressionVoicings.includes(improvementTarget.voicingFamily)
      && voicingAvailableInMode(config, unlocked, activeVoicings, improvementTarget.voicingFamily)
      ? improvementTarget.voicingFamily
      : null)
    ?? selectVoicing(config, progress, unlocked, progression, focus, random);

  const tokensById: Phrase['tokensById'] = {};
  const events: Phrase['events'] = [];

  let previousMidiVoicing: number[] | undefined = carryForwardVoicingFamily
    ? previousPhraseLastToken?.midiVoicing
    : undefined;
  let carryoverIntoNextBar = 0;

  progression.steps.forEach((step, index) => {
    const token = buildChordToken({
      tonic,
      lane,
      roman: step.roman,
      voicingFamily,
      midiRange: midiRange ?? {
        min: progress.settings.registerMin,
        max: progress.settings.registerMax,
      },
      prevVoicing: previousMidiVoicing,
      maxVoiceMotionSemitones: progression.maxVoiceMotionSemitones,
    });

    tokensById[token.id] = token;
    previousMidiVoicing = token.midiVoicing;

    const rhythmCellId = selectRhythm(
      config.rhythm,
      progression.rhythmPlan[index % progression.rhythmPlan.length],
      carryoverIntoNextBar,
      random,
    );
    const bar = index + 1;

    const rhythmCell = RHYTHM_CELLS[rhythmCellId];
    const rhythmSpan = Math.max(...rhythmCell.hits.map((hit) => hit.offsetBeats + hit.durationBeats));
    carryoverIntoNextBar = Math.max(0, rhythmSpan - 4);

    rhythmCell.hits.forEach((hit, hitIndex) => {
      events.push({
        id: `${progression.id}:event:${index + 1}:${hitIndex + 1}`,
        chordTokenId: token.id,
        progressionStepIndex: index,
        bar,
        beat: hit.offsetBeats + 1,
        durationBeats: hit.durationBeats,
        rhythmCellId,
      });
    });
  });

  return {
    id: `phrase:${config.mode}:${lane}:${config.mode === 'guided' ? config.guidedFlowMode : config.improvisationProgressionMode}:${progression.id}:${tonic}:${voicingFamily}:${Date.now().toString(36)}`,
    lane,
    tonic,
    tempo,
    timeSignature: '4/4',
    events,
    tokensById,
    progressionId: progression.id,
    progression,
    focusType: focus,
  };
}

export interface PotentialPhraseVariant {
  progression: ProgressionDefinition;
  tonic: string;
  voicingFamily: VoicingFamily;
}

export function listPotentialPhraseVariants(progress: ProgressState): PotentialPhraseVariant[] {
  const unlocked = aggregateUnlockState(progress);
  const progressions = playableProgressions(progress.exerciseConfig, progress);
  const activeVoicings = new Set(activeVoicingPool(progress.exerciseConfig, progress, unlocked, progressions));
  if (progressions.length === 0) {
    return [];
  }

  const roots = rootsForKeySet(progress.exerciseConfig.keySet);
  const variants: PotentialPhraseVariant[] = [];

  progressions.forEach((progression) => {
    const voicings = progressionVoicingPool(progress.exerciseConfig, progression, unlocked, activeVoicings);

    roots.forEach((tonic) => {
      voicings.forEach((voicingFamily) => {
        variants.push({
          progression,
          tonic,
          voicingFamily,
        });
      });
    });
  });

  return variants;
}

export function countPotentialProgressions(progress: ProgressState): number {
  return unique(listPotentialPhraseVariants(progress).map((variant) => variant.progression.id)).length;
}
