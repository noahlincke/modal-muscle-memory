import { Chord } from 'tonal';
import type { ChordToken, ModeLane, VoicingFamily } from '../../types/music';
import { normalizePitchClass, spellIntervalAbove } from './noteUtils';
import { resolveRomanToChord } from './roman';
import { solveVoiceLeading } from './voiceLeading';

interface BuildChordTokenInput {
  tonic: string;
  lane: ModeLane;
  roman: string;
  voicingFamily: VoicingFamily;
  midiRange: { min: number; max: number };
  prevVoicing?: number[];
  maxVoiceMotionSemitones: number;
}

interface ChordToneSet {
  root: string;
  third: string;
  fifth: string;
  seventh?: string;
}

function deriveChordTones(rootSpelling: string, quality: string): ChordToneSet {
  switch (quality) {
    case 'maj7':
      return {
        root: rootSpelling,
        third: spellIntervalAbove(rootSpelling, 3, 4),
        fifth: spellIntervalAbove(rootSpelling, 5, 7),
        seventh: spellIntervalAbove(rootSpelling, 7, 11),
      };
    case 'm7':
      return {
        root: rootSpelling,
        third: spellIntervalAbove(rootSpelling, 3, 3),
        fifth: spellIntervalAbove(rootSpelling, 5, 7),
        seventh: spellIntervalAbove(rootSpelling, 7, 10),
      };
    case '7':
      return {
        root: rootSpelling,
        third: spellIntervalAbove(rootSpelling, 3, 4),
        fifth: spellIntervalAbove(rootSpelling, 5, 7),
        seventh: spellIntervalAbove(rootSpelling, 7, 10),
      };
    case 'm7b5':
      return {
        root: rootSpelling,
        third: spellIntervalAbove(rootSpelling, 3, 3),
        fifth: spellIntervalAbove(rootSpelling, 5, 6),
        seventh: spellIntervalAbove(rootSpelling, 7, 10),
      };
    case 'min':
      return {
        root: rootSpelling,
        third: spellIntervalAbove(rootSpelling, 3, 3),
        fifth: spellIntervalAbove(rootSpelling, 5, 7),
      };
    case 'maj':
    default:
      return {
        root: rootSpelling,
        third: spellIntervalAbove(rootSpelling, 3, 4),
        fifth: spellIntervalAbove(rootSpelling, 5, 7),
      };
  }
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function requiredForVoicing(
  voicing: VoicingFamily,
  tones: ChordToneSet,
): { required: string[]; optional: string[]; ordered: string[] } {
  const all7 = unique([
    tones.root,
    tones.third,
    tones.fifth,
    ...(tones.seventh ? [tones.seventh] : []),
  ]);

  switch (voicing) {
    case 'shell_173': {
      const shell = unique([
        tones.root,
        tones.seventh ?? tones.fifth,
        tones.third,
      ]);
      return {
        required: shell,
        optional: unique([tones.fifth]),
        ordered: [tones.root, tones.seventh ?? tones.fifth, tones.third],
      };
    }
    case 'shell_137': {
      const shell = unique([
        tones.root,
        tones.third,
        tones.seventh ?? tones.fifth,
      ]);
      return {
        required: shell,
        optional: unique([tones.fifth]),
        ordered: [tones.root, tones.third, tones.seventh ?? tones.fifth],
      };
    }
    case 'triad_root':
      return {
        required: [tones.root, tones.third, tones.fifth],
        optional: tones.seventh ? [tones.seventh] : [],
        ordered: [tones.root, tones.third, tones.fifth],
      };
    case 'inversion_1': {
      const ordered = tones.seventh
        ? [tones.third, tones.fifth, tones.seventh, tones.root]
        : [tones.third, tones.fifth, tones.root];
      return {
        required: all7,
        optional: [],
        ordered,
      };
    }
    case 'closed_7th':
    default:
      return {
        required: all7,
        optional: [],
        ordered: tones.seventh
          ? [tones.root, tones.third, tones.fifth, tones.seventh]
          : [tones.root, tones.third, tones.fifth],
      };
  }
}

export function buildChordToken({
  tonic,
  lane,
  roman,
  voicingFamily,
  midiRange,
  prevVoicing,
  maxVoiceMotionSemitones,
}: BuildChordTokenInput): ChordToken {
  const resolved = resolveRomanToChord(tonic, roman);
  const tones = deriveChordTones(resolved.rootSpelling, resolved.quality);
  const voicing = requiredForVoicing(voicingFamily, tones);

  const tonalDetected = Chord.get(resolved.symbol).notes.map(normalizePitchClass);
  const pitchClasses = tonalDetected.length > 0 ? tonalDetected : voicing.required.map(normalizePitchClass);
  const orderedPitchClasses = voicing.ordered.map(normalizePitchClass);

  const midiVoicing = solveVoiceLeading({
    orderedPitchClasses,
    midiRange,
    prevVoicing,
    maxMotionSemitones: maxVoiceMotionSemitones,
  });

  const inversion = voicingFamily === 'inversion_1' ? 1 : null;

  return {
    id: `${lane}:${tonic}:${roman}:${voicingFamily}:${inversion ?? 0}:v1`,
    tonic,
    lane,
    roman,
    symbol: resolved.symbol,
    quality: resolved.quality,
    pitchClasses: unique(pitchClasses),
    requiredPitchClasses: unique(voicing.required.map(normalizePitchClass)),
    optionalPitchClasses: unique(voicing.optional.map(normalizePitchClass)),
    spelledVoicing: voicing.ordered,
    voicingFamily,
    inversion,
    bassPolicy: voicingFamily === 'inversion_1' ? 'exact' : 'allow_inversion',
    topNotePolicy: voicingFamily === 'inversion_1' ? 'preferred' : 'any_allowed',
    midiRange,
    midiVoicing,
  };
}
