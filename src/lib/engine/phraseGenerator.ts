import { getPackForLane } from '../../content/packs';
import { RHYTHM_CELLS } from '../../content/rhythmCells';
import type {
  Phrase,
  PhraseFocusType,
  ProgressionDefinition,
  RhythmCellId,
  VoicingFamily,
} from '../../types/music';
import type { ExerciseConfig, ProgressState, UnlockState } from '../../types/progress';
import { buildChordToken } from '../theory/chordToken';
import { choosePhraseFocus } from './scheduler';

interface GeneratePhraseInput {
  config: ExerciseConfig;
  progress: ProgressState;
  tempo: number;
  random?: () => number;
  midiRange?: { min: number; max: number };
  focusOverride?: PhraseFocusType;
}

function choose<T>(items: T[], random: () => number): T {
  const index = Math.floor(random() * items.length);
  return items[Math.min(index, items.length - 1)];
}

function intersect<T>(a: T[], b: T[]): T[] {
  const bSet = new Set(b);
  return a.filter((item) => bSet.has(item));
}

function parseRomanFromTokenId(tokenId: string): string | null {
  const parts = tokenId.split(':');
  return parts.length >= 3 ? parts[2] : null;
}

function pickProgressionForFocus(
  progressions: ProgressionDefinition[],
  focus: PhraseFocusType,
  progress: ProgressState,
  lane: ExerciseConfig['lane'],
  random: () => number,
): ProgressionDefinition {
  if (focus === 'weak_node') {
    const weakNode = Object.entries(progress.nodeMastery)
      .filter(([tokenId, stat]) => tokenId.startsWith(`${lane}:`) && stat.attempts > 1)
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
  if (selectedRhythm !== 'all' && unlocked.rhythms.includes(selectedRhythm)) {
    return selectedRhythm;
  }

  if (unlocked.rhythms.includes(requested)) {
    return requested;
  }

  const fallback = unlocked.rhythms.filter((rhythm) =>
    ['block_whole', 'quarters', 'charleston'].includes(rhythm),
  );

  return fallback.length > 0 ? choose(fallback, random) : 'block_whole';
}

export function generatePhrase({
  config,
  progress,
  tempo,
  random = Math.random,
  midiRange,
  focusOverride,
}: GeneratePhraseInput): Phrase {
  const pack = getPackForLane(config.lane);
  if (!pack) {
    throw new Error(`No content pack installed for lane: ${config.lane}`);
  }

  const unlocked = progress.unlocksByLane[config.lane];
  const roots = intersect(pack.roots, unlocked.roots);
  const progressions = pack.progressions;

  const focus = focusOverride ?? choosePhraseFocus({
    progress,
    difficulty: 1,
    random,
  });

  const progression = pickProgressionForFocus(progressions, focus, progress, config.lane, random);
  const tonic = roots.length > 0 ? choose(roots, random) : pack.roots[0];
  const voicingFamily = selectVoicing(unlocked, progression, focus, random);

  const tokensById: Phrase['tokensById'] = {};
  const events: Phrase['events'] = [];

  let previousMidiVoicing: number[] | undefined;

  progression.steps.forEach((step, index) => {
    const token = buildChordToken({
      tonic,
      lane: config.lane,
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
    const rhythmCell = RHYTHM_CELLS[rhythmCellId];
    const bar = index + 1;

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
    id: `phrase:${config.mode}:${config.lane}:${progression.id}:${tonic}:${voicingFamily}:${Date.now().toString(36)}`,
    lane: config.lane,
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
  const pack = getPackForLane(progress.exerciseConfig.lane);
  if (!pack) {
    return 0;
  }

  const unlocked = progress.unlocksByLane[progress.exerciseConfig.lane];
  const rootCount = intersect(pack.roots, unlocked.roots).length || 1;
  const voicingCount = intersect(pack.voicings, unlocked.voicings).length || 1;
  const rhythmCount = progress.exerciseConfig.rhythm === 'all'
    ? (intersect(pack.rhythms, unlocked.rhythms).length || 1)
    : 1;

  return pack.progressions.length * rootCount * voicingCount * rhythmCount;
}
