import { fingeredScaleOptionsForFamilies, getScaleFingering } from '../../content/scaleFingerings';
import { resolveIncludedKeyRoots } from '../../content/keys';
import { getScaleOption } from '../../content/scales';
import type {
  PhraseFocusType,
  ScaleFingeringSequence,
  ScaleId,
  ScalePracticeDirection,
  ScalePracticeHand,
  ScalePrompt,
  ScalePromptNote,
} from '../../types/music';
import type { ExerciseConfig, ProgressState } from '../../types/progress';
import { noteNameToMidi, spellScaleDegree } from '../theory/noteUtils';
import { preferredCenterForClef } from '../theory/voicingPlacement';

interface GenerateScalePromptInput {
  config: ExerciseConfig;
  progress: ProgressState;
  random?: () => number;
  promptNonce?: number | string;
  focusOverride?: PhraseFocusType;
  tonicOverride?: string;
  scaleIdOverride?: ScaleId;
  handOverride?: ScalePracticeHand;
  directionOverride?: ScalePracticeDirection;
  midiRangeOverride?: { min: number; max: number };
}

function choose<T>(items: T[], random: () => number): T {
  const index = Math.floor(random() * items.length);
  return items[Math.min(index, items.length - 1)];
}

function intervalTokenParts(interval: string): { degree: number; accidentalOffset: number } {
  const match = interval.match(/^([b#]*)(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported interval token: ${interval}`);
  }

  const [, accidentalText, degreeText] = match;
  let accidentalOffset = 0;
  for (const symbol of accidentalText) {
    accidentalOffset += symbol === '#' ? 1 : -1;
  }

  return {
    degree: Number.parseInt(degreeText, 10),
    accidentalOffset,
  };
}

function buildAscendingSpelledNotes(tonic: string, scaleId: ScaleId): Array<{ spelling: string; degreeLabel: string }> {
  const scale = getScaleOption(scaleId);
  const spelled = scale.intervalFormula.map((interval) => {
    const { degree, accidentalOffset } = intervalTokenParts(interval);
    return {
      spelling: spellScaleDegree(tonic, degree, accidentalOffset),
      degreeLabel: interval,
    };
  });

  return [
    { spelling: tonic, degreeLabel: '1' },
    ...spelled.slice(1),
    { spelling: tonic, degreeLabel: '8' },
  ];
}

function buildAscendingMidiNotes(
  spelledNotes: Array<{ spelling: string; degreeLabel: string }>,
  baseOctave: number,
): Array<{ midi: number; spelling: string; degreeLabel: string }> {
  const result: Array<{ midi: number; spelling: string; degreeLabel: string }> = [];
  let previousMidi = Number.NEGATIVE_INFINITY;

  spelledNotes.forEach((note, index) => {
    let octave = baseOctave;
    if (index === spelledNotes.length - 1) {
      octave += 1;
    }

    let midi = noteNameToMidi(`${note.spelling}${octave}`);
    while (midi <= previousMidi) {
      midi += 12;
    }

    result.push({
      midi,
      spelling: note.spelling,
      degreeLabel: note.degreeLabel,
    });
    previousMidi = midi;
  });

  return result;
}

function centerMidiSequence(
  notes: Array<{ midi: number; spelling: string; degreeLabel: string }>,
  midiRange: { min: number; max: number },
  targetCenter: number,
): Array<{ midi: number; spelling: string; degreeLabel: string }> {
  let best = notes;
  let bestDistance = Math.abs(((notes[0]?.midi ?? 0) + (notes[notes.length - 1]?.midi ?? 0)) / 2 - targetCenter);

  for (let shift = -24; shift <= 24; shift += 12) {
    const shifted = notes.map((note) => ({
      ...note,
      midi: note.midi + shift,
    }));
    const withinRange = shifted.every((note) => note.midi >= midiRange.min && note.midi <= midiRange.max);
    if (!withinRange) {
      continue;
    }

    const center = ((shifted[0]?.midi ?? 0) + (shifted[shifted.length - 1]?.midi ?? 0)) / 2;
    const distance = Math.abs(center - targetCenter);
    if (distance < bestDistance) {
      best = shifted;
      bestDistance = distance;
    }
  }

  return best;
}

function handForClef(clef: 'treble' | 'bass'): ScalePracticeHand {
  return clef === 'bass' ? 'lh' : 'rh';
}

function sequenceForHandAndDirection(
  fingeringSequences: ScaleFingeringSequence[],
  hand: ScalePracticeHand,
  direction: 'ascending' | 'descending',
): number[] {
  const sequence = fingeringSequences.find((candidate) => candidate.hand === hand && candidate.direction === direction);
  if (!sequence) {
    throw new Error(`Missing ${hand} ${direction} fingering sequence.`);
  }

  return sequence.fingers;
}

function buildPromptSequence(
  ascendingNotes: Array<{ midi: number; spelling: string; degreeLabel: string }>,
  ascendingFingers: number[],
  descendingFingers: number[],
  direction: ScalePracticeDirection,
): ScalePromptNote[] {
  const ascending = ascendingNotes.map((note, index) => ({
    midi: note.midi,
    spelling: note.spelling,
    degreeLabel: note.degreeLabel,
    finger: ascendingFingers[index],
  }));

  if (direction === 'ascending') {
    return ascending;
  }

  const descending = [...ascendingNotes]
    .reverse()
    .map((note, index) => ({
      midi: note.midi,
      spelling: note.spelling,
      degreeLabel: index === ascendingNotes.length - 1 ? '1' : note.degreeLabel,
      finger: descendingFingers[index],
    }));

  if (direction === 'descending') {
    return descending;
  }

  return [
    ...ascending,
    ...descending.slice(1),
  ];
}

interface ScaleTarget {
  scaleId: ScaleId;
  tonic: string;
}

export function listPlayableScaleTargets(config: ExerciseConfig): ScaleTarget[] {
  const roots = resolveIncludedKeyRoots(config.keySet, config.includedKeyRoots);
  return roots.flatMap((tonic) => (
    fingeredScaleOptionsForFamilies(config.enabledScaleFamilyIds, tonic, config.scaleOctaveSpan)
      .map((scale) => ({
        scaleId: scale.id,
        tonic,
      }))
  ));
}

export function generateScalePrompt(input: GenerateScalePromptInput): ScalePrompt {
  const random = input.random ?? Math.random;
  const clef = input.progress.settings.staffClef;
  const hand = input.handOverride ?? handForClef(clef);
  const direction = input.directionOverride ?? input.config.scalePracticeDirection;
  const midiRange = input.midiRangeOverride ?? {
    min: input.progress.settings.registerMin,
    max: input.progress.settings.registerMax,
  };
  const targetCenter = preferredCenterForClef(clef, midiRange);
  const playableTargets = listPlayableScaleTargets(input.config);
  const target = input.scaleIdOverride && input.tonicOverride
    ? {
      scaleId: input.scaleIdOverride,
      tonic: input.tonicOverride,
    }
    : input.scaleIdOverride
      ? (() => {
        const matching = playableTargets.filter((candidate) => candidate.scaleId === input.scaleIdOverride);
        if (matching.length === 0) {
          return null;
        }
        return input.tonicOverride
          ? matching.find((candidate) => candidate.tonic === input.tonicOverride) ?? null
          : choose(matching, random);
      })()
      : input.tonicOverride
        ? (() => {
          const matching = playableTargets.filter((candidate) => candidate.tonic === input.tonicOverride);
          if (matching.length === 0) {
            return null;
          }
          return choose(matching, random);
        })()
        : (playableTargets.length > 0 ? choose(playableTargets, random) : null);

  if (!target) {
    throw new Error('No fingered scales match the current scale-mode filter.');
  }

  const fingering = getScaleFingering(target.scaleId, target.tonic, input.config.scaleOctaveSpan);
  if (!fingering) {
    throw new Error(`Missing fingering definition for ${target.tonic} ${target.scaleId}.`);
  }

  const ascendingFingers = sequenceForHandAndDirection(fingering.sequences, hand, 'ascending');
  const descendingFingers = sequenceForHandAndDirection(fingering.sequences, hand, 'descending');
  const spelledNotes = buildAscendingSpelledNotes(target.tonic, target.scaleId);
  const baseOctave = clef === 'bass' ? 2 : 4;
  const ascendingMidiNotes = centerMidiSequence(
    buildAscendingMidiNotes(spelledNotes, baseOctave),
    midiRange,
    targetCenter,
  );

  return {
    id: `scale:${target.scaleId}:${target.tonic}:${hand}:${direction}:${input.config.scaleOctaveSpan}:${String(input.promptNonce ?? 0)}`,
    scaleId: target.scaleId,
    tonic: target.tonic,
    hand,
    direction,
    octaveSpan: input.config.scaleOctaveSpan,
    clef,
    midiRange,
    noteSequence: buildPromptSequence(
      ascendingMidiNotes,
      ascendingFingers,
      descendingFingers,
      direction,
    ),
    focusType: input.focusOverride ?? 'new_item',
  };
}
