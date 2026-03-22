import { getContentBlock } from '../../content/curriculum';
import { rootsForKeySet } from '../../content/keys';
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

interface GeneratePhraseInput {
  config: ExerciseConfig;
  progress: ProgressState;
  tempo: number;
  previousPhrase?: Phrase | null;
  random?: () => number;
  midiRange?: { min: number; max: number };
  focusOverride?: PhraseFocusType;
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

function intersect<T>(a: T[], b: T[]): T[] {
  const bSet = new Set(b);
  return a.filter((item) => bSet.has(item));
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

function progressionLookup(progressions: ProgressionDefinition[]): Map<string, ProgressionDefinition> {
  return new Map(progressions.map((progression) => [progression.id, progression]));
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

  const movement = Math.min(1, Math.max(0, chainMovement / 100));
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
  progressions: ProgressionDefinition[],
  progress: ProgressState,
  availableRoots: string[],
  unlocked: UnlockState,
  chainMovement: number,
  random: () => number,
): ImprovementTarget | null {
  const byId = progressionLookup(progressions);
  const allowedRoots = new Set(availableRoots);
  const availableVoicings = new Set(unlocked.voicings);
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

      if (!availableVoicings.has(parsed.voicingFamily) || !progression.allowedVoicings.includes(parsed.voicingFamily)) {
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

  const movement = Math.min(1, Math.max(0, chainMovement / 100));
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

function selectVoicing(
  unlocked: UnlockState,
  progression: ProgressionDefinition,
  focus: PhraseFocusType,
  random: () => number,
): VoicingFamily {
  const available = intersect(progression.allowedVoicings, unlocked.voicings) as VoicingFamily[];
  if (available.length === 0) {
    return progression.allowedVoicings[0];
  }

  if (focus === 'new_item' && available.includes('inversion_1')) {
    return 'inversion_1';
  }

  return choose(available, random);
}

function selectRhythm(
  unlocked: UnlockState,
  selectedRhythm: ExerciseConfig['rhythm'],
  requested: RhythmCellId,
  random: () => number,
): RhythmCellId {
  const selectedPool = selectedRhythm.includes('all')
    ? unlocked.rhythms
    : selectedRhythm.filter((rhythm): rhythm is RhythmCellId => rhythm !== 'all' && unlocked.rhythms.includes(rhythm));

  if (selectedPool.includes(requested)) {
    return requested;
  }

  if (selectedPool.length > 0) {
    return choose(selectedPool, random);
  }

  const fallback = unlocked.rhythms.filter((rhythm) =>
    ['block_whole', 'quarters', 'charleston'].includes(rhythm),
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

export function matchingProgressionIds(config: ExerciseConfig): string[] {
  return queryProgressions(config).map((progression) => progression.id);
}

export function countMatchingProgressions(config: ExerciseConfig): number {
  return matchingProgressionIds(config).length;
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
}: GeneratePhraseInput): Phrase {
  const progressions = queryProgressions(config);
  if (progressions.length === 0) {
    throw new Error('No progressions match the current practice filter.');
  }

  const unlocked = aggregateUnlockState(progress);
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
    ? pickImprovementTarget(progressions, progress, roots, unlocked, config.chainMovement, random)
    : null;
  const progression = pickChainedProgression(progressions, chainSource, config.chainMovement, random)
    ?? improvementTarget?.progression
    ?? (isRandomFlow(config) ? choose(progressions, random) : pickProgressionForFocus(progressions, focus, progress, random));
  const lane = progression.lane;
  const tonic = chainSource?.tonic
    ?? improvementTarget?.tonic
    ?? (roots.length > 0 ? choose(roots, random) : 'C');
  const previousPhraseLastEvent = chainSource ? chainSource.events[chainSource.events.length - 1] : null;
  const previousPhraseLastToken = previousPhraseLastEvent
    ? chainSource?.tokensById[previousPhraseLastEvent.chordTokenId]
    : null;
  const carryForwardVoicingFamily = previousPhraseLastToken
    && progression.allowedVoicings.includes(previousPhraseLastToken.voicingFamily)
    && unlocked.voicings.includes(previousPhraseLastToken.voicingFamily)
    ? previousPhraseLastToken.voicingFamily
    : null;
  const voicingFamily = carryForwardVoicingFamily
    ?? (improvementTarget
      && progression.allowedVoicings.includes(improvementTarget.voicingFamily)
      && unlocked.voicings.includes(improvementTarget.voicingFamily)
      ? improvementTarget.voicingFamily
      : null)
    ?? selectVoicing(unlocked, progression, focus, random);

  const tokensById: Phrase['tokensById'] = {};
  const events: Phrase['events'] = [];

  let previousMidiVoicing: number[] | undefined = carryForwardVoicingFamily
    ? previousPhraseLastToken?.midiVoicing
    : undefined;

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
      unlocked,
      config.rhythm,
      progression.rhythmPlan[index % progression.rhythmPlan.length],
      random,
    );
    const bar = index + 1;

    if (config.mode === 'improvisation') {
      events.push({
        id: `${progression.id}:event:${index + 1}:landing`,
        chordTokenId: token.id,
        progressionStepIndex: index,
        bar,
        beat: 1,
        durationBeats: 4,
        rhythmCellId,
      });
      return;
    }

    const rhythmCell = RHYTHM_CELLS[rhythmCellId];
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

export function countPotentialStarterPhrases(progress: ProgressState): number {
  const progressions = queryProgressions(progress.exerciseConfig);
  if (progressions.length === 0) {
    return 0;
  }

  const unlocked = aggregateUnlockState(progress);
  const rootCount = rootsForKeySet(progress.exerciseConfig.keySet).length || 1;
  const voicingCount = unlocked.voicings.length || 1;
  const selectedRhythms = progress.exerciseConfig.rhythm.includes('all')
    ? unlocked.rhythms
    : progress.exerciseConfig.rhythm.filter((rhythm): rhythm is RhythmCellId => rhythm !== 'all' && unlocked.rhythms.includes(rhythm));
  const rhythmCount = selectedRhythms.length || 1;

  return progressions.length * rootCount * voicingCount * rhythmCount;
}
