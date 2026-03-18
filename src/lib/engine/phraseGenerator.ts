import { getPackForLane } from '../../content/packs';
import type {
  ModeLane,
  Phrase,
  PhraseFocusType,
  PhraseTemplate,
  RhythmCellId,
  VoicingFamily,
} from '../../types/music';
import type { ProgressState, UnlockState } from '../../types/progress';
import { buildChordToken } from '../theory/chordToken';
import { choosePhraseFocus } from './scheduler';

interface GeneratePhraseInput {
  lane: ModeLane;
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

function pickTemplateForFocus(
  templates: PhraseTemplate[],
  focus: PhraseFocusType,
  progress: ProgressState,
  lane: ModeLane,
  random: () => number,
): PhraseTemplate {
  if (focus === 'weak_node') {
    const weakNode = Object.entries(progress.nodeMastery)
      .filter(([tokenId, stat]) => tokenId.startsWith(`${lane}:`) && stat.attempts > 1)
      .sort((a, b) => a[1].accuracyEwma - b[1].accuracyEwma)[0];

    const weakRoman = weakNode ? parseRomanFromTokenId(weakNode[0]) : null;
    if (weakRoman) {
      const matching = templates.filter((template) => template.romanPlan.includes(weakRoman));
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
        const matching = templates.filter((template) => {
          for (let i = 0; i < template.romanPlan.length - 1; i += 1) {
            if (template.romanPlan[i] === fromRoman && template.romanPlan[i + 1] === toRoman) {
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
    const byDifficulty = [...templates].sort((a, b) => b.difficulty - a.difficulty);
    return byDifficulty[0];
  }

  if (focus === 'due_review') {
    const lowDifficulty = [...templates].sort((a, b) => a.difficulty - b.difficulty);
    return choose(lowDifficulty.slice(0, Math.max(1, lowDifficulty.length / 2)), random);
  }

  return choose(templates, random);
}

function selectVoicing(
  unlocked: UnlockState,
  template: PhraseTemplate,
  focus: PhraseFocusType,
  random: () => number,
): VoicingFamily {
  const available = intersect(template.allowedVoicings, unlocked.voicings) as VoicingFamily[];
  if (available.length === 0) {
    return template.allowedVoicings[0];
  }

  if (focus === 'new_item' && available.includes('inversion_1')) {
    return 'inversion_1';
  }

  return choose(available, random);
}

function selectRhythm(
  unlocked: UnlockState,
  requested: RhythmCellId,
  random: () => number,
): RhythmCellId {
  if (unlocked.rhythms.includes(requested)) {
    return requested;
  }

  const fallback = unlocked.rhythms.filter((rhythm) =>
    ['block_whole', 'quarters', 'charleston'].includes(rhythm),
  );

  return fallback.length > 0 ? choose(fallback, random) : 'block_whole';
}

export function generatePhrase({
  lane,
  progress,
  tempo,
  random = Math.random,
  midiRange,
  focusOverride,
}: GeneratePhraseInput): Phrase {
  const pack = getPackForLane(lane);
  if (!pack) {
    throw new Error(`No content pack installed for lane: ${lane}`);
  }

  const unlocked = progress.unlocksByLane[lane];
  const roots = intersect(pack.roots, unlocked.roots);
  const templates = pack.templates;

  const focus = focusOverride ?? choosePhraseFocus({
    progress,
    difficulty: 1,
    random,
  });

  const template = pickTemplateForFocus(templates, focus, progress, lane, random);
  const tonic = roots.length > 0 ? choose(roots, random) : pack.roots[0];
  const voicingFamily = selectVoicing(unlocked, template, focus, random);

  const tokensById: Phrase['tokensById'] = {};
  const events: Phrase['events'] = [];

  let previousMidiVoicing: number[] | undefined;

  template.romanPlan.forEach((roman, index) => {
    const token = buildChordToken({
      tonic,
      lane,
      roman,
      voicingFamily,
      midiRange: midiRange ?? {
        min: progress.settings.registerMin,
        max: progress.settings.registerMax,
      },
      prevVoicing: previousMidiVoicing,
      maxVoiceMotionSemitones: template.maxVoiceMotionSemitones,
    });

    tokensById[token.id] = token;
    previousMidiVoicing = token.midiVoicing;

    const bar = Math.floor(index / 2) + 1;
    const beat = index % 2 === 0 ? 1 : 3;
    const rhythmCellId = selectRhythm(
      unlocked,
      template.rhythmPlan[index % template.rhythmPlan.length],
      random,
    );

    events.push({
      id: `${template.id}:event:${index + 1}`,
      chordTokenId: token.id,
      bar,
      beat,
      durationBeats: 2,
      rhythmCellId,
    });
  });

  return {
    id: `phrase:${lane}:${template.id}:${tonic}:${voicingFamily}:${Date.now().toString(36)}`,
    lane,
    tonic,
    tempo,
    timeSignature: '4/4',
    events,
    tokensById,
    templateId: template.id,
    focusType: focus,
  };
}

export function countPotentialStarterPhrases(progress: ProgressState): number {
  return (['ionian', 'aeolian', 'ionian_aeolian_mixture'] as const).reduce(
    (total, lane) => {
      const pack = getPackForLane(lane);
      if (!pack) return total;

      const unlocked = progress.unlocksByLane[lane];
      const rootCount = intersect(pack.roots, unlocked.roots).length || 1;
      const voicingCount = intersect(pack.voicings, unlocked.voicings).length || 1;
      const rhythmCount = intersect(pack.rhythms, unlocked.rhythms).length || 1;
      return total + pack.templates.length * rootCount * voicingCount * rhythmCount;
    },
    0,
  );
}
