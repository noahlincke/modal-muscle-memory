import { Chord } from 'tonal';
import type { ChordToken, ModeLane, VoicingFamily } from '../../types/music';
import { normalizePitchClass, spellIntervalAbove } from './noteUtils';
import { resolveRomanToChord } from './roman';
import { solveVoiceLeading } from './voiceLeading';
import { transposeVoicingByOctaveTowardCenter } from './voicingPlacement';

interface BuildChordTokenInput {
  tonic: string;
  lane: ModeLane;
  roman: string;
  voicingFamily: VoicingFamily;
  midiRange: { min: number; max: number };
  prevVoicing?: number[];
  maxVoiceMotionSemitones: number;
  preferredCenterMidi?: number;
}

interface ChordToneSet {
  root: string;
  third: string;
  fifth: string;
  seventh?: string;
  ninth?: string;
  thirteenth?: string;
}

function maxSpanForVoicing(voicingFamily: VoicingFamily): number | undefined {
  switch (voicingFamily) {
    case 'guide_tone_37':
    case 'guide_tone_73':
      return 8;
    case 'shell_137':
    case 'shell_173':
    case 'triad_root':
    case 'inversion_1':
    case 'inversion_2':
    case 'slash':
    case 'closed_7th':
    case 'rootless_379':
    case 'rootless_7313':
      return 12;
    case 'six_nine':
    case 'ninth':
    case 'rootless':
      return 12;
    default:
      return undefined;
  }
}

function deriveChordTones(rootSpelling: string, quality: string): ChordToneSet {
  switch (quality) {
    case 'maj7':
      return {
        root: rootSpelling,
        third: spellIntervalAbove(rootSpelling, 3, 4),
        fifth: spellIntervalAbove(rootSpelling, 5, 7),
        seventh: spellIntervalAbove(rootSpelling, 7, 11),
        ninth: spellIntervalAbove(rootSpelling, 9, 14),
        thirteenth: spellIntervalAbove(rootSpelling, 13, 21),
      };
    case 'm7':
      return {
        root: rootSpelling,
        third: spellIntervalAbove(rootSpelling, 3, 3),
        fifth: spellIntervalAbove(rootSpelling, 5, 7),
        seventh: spellIntervalAbove(rootSpelling, 7, 10),
        ninth: spellIntervalAbove(rootSpelling, 9, 14),
        thirteenth: spellIntervalAbove(rootSpelling, 13, 21),
      };
    case '7':
      return {
        root: rootSpelling,
        third: spellIntervalAbove(rootSpelling, 3, 4),
        fifth: spellIntervalAbove(rootSpelling, 5, 7),
        seventh: spellIntervalAbove(rootSpelling, 7, 10),
        ninth: spellIntervalAbove(rootSpelling, 9, 14),
        thirteenth: spellIntervalAbove(rootSpelling, 13, 21),
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
  const guideTones = unique([
    tones.third,
    ...(tones.seventh ? [tones.seventh] : [tones.fifth]),
  ]);
  const all7 = unique([
    tones.root,
    tones.third,
    tones.fifth,
    ...(tones.seventh ? [tones.seventh] : []),
  ]);

  switch (voicing) {
    case 'guide_tone_37':
      return {
        required: guideTones,
        optional: unique([tones.root, tones.fifth]),
        ordered: [tones.third, tones.seventh ?? tones.fifth],
      };
    case 'guide_tone_73':
      return {
        required: guideTones,
        optional: unique([tones.root, tones.fifth]),
        ordered: [tones.seventh ?? tones.fifth, tones.third],
      };
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
    case 'six_nine': {
      const ordered = [
        tones.root,
        tones.third,
        tones.thirteenth ?? tones.fifth,
        tones.ninth ?? tones.fifth,
      ];
      return {
        required: unique(ordered),
        optional: unique([tones.fifth, tones.seventh].filter((tone): tone is string => Boolean(tone))),
        ordered,
      };
    }
    case 'ninth': {
      const ordered = tones.seventh
        ? [tones.root, tones.third, tones.seventh, tones.ninth ?? tones.fifth]
        : [tones.root, tones.third, tones.fifth, tones.ninth ?? tones.fifth];
      return {
        required: unique(ordered),
        optional: unique([tones.fifth, tones.thirteenth].filter((tone): tone is string => Boolean(tone))),
        ordered,
      };
    }
    case 'rootless_379': {
      const ordered = [
        tones.third,
        tones.seventh ?? tones.fifth,
        tones.ninth ?? tones.fifth,
      ];
      return {
        required: unique(ordered),
        optional: unique([tones.fifth, tones.thirteenth].filter((tone): tone is string => Boolean(tone))),
        ordered,
      };
    }
    case 'rootless_7313': {
      const ordered = [
        tones.seventh ?? tones.fifth,
        tones.third,
        tones.thirteenth ?? tones.fifth,
      ];
      return {
        required: unique(ordered),
        optional: unique([tones.fifth, tones.ninth].filter((tone): tone is string => Boolean(tone))),
        ordered,
      };
    }
    case 'rootless': {
      const ordered = [
        tones.third,
        tones.seventh ?? tones.fifth,
        tones.ninth ?? tones.fifth,
        tones.thirteenth ?? tones.fifth,
      ];
      return {
        required: unique(ordered),
        optional: unique([tones.root, tones.fifth].filter((tone): tone is string => Boolean(tone))),
        ordered,
      };
    }
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
    case 'inversion_2': {
      const ordered = tones.seventh
        ? [tones.fifth, tones.seventh, tones.root, tones.third]
        : [tones.fifth, tones.root, tones.third];
      return {
        required: all7,
        optional: [],
        ordered,
      };
    }
    case 'slash': {
      const ordered = tones.seventh
        ? [tones.fifth, tones.root, tones.third, tones.seventh]
        : [tones.fifth, tones.root, tones.third];
      return {
        required: unique(ordered),
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
  preferredCenterMidi,
}: BuildChordTokenInput): ChordToken {
  const resolved = resolveRomanToChord(tonic, roman);
  const tones = deriveChordTones(resolved.rootSpelling, resolved.quality);
  const voicing = requiredForVoicing(voicingFamily, tones);

  const tonalDetected = Chord.get(resolved.symbol).notes.map(normalizePitchClass);
  const pitchClasses = tonalDetected.length > 0 ? tonalDetected : voicing.required.map(normalizePitchClass);
  const orderedPitchClasses = voicing.ordered.map(normalizePitchClass);

  const midiVoicing = transposeVoicingByOctaveTowardCenter(solveVoiceLeading({
    orderedPitchClasses,
    midiRange,
    prevVoicing,
    maxMotionSemitones: maxVoiceMotionSemitones,
    maxSpanSemitones: maxSpanForVoicing(voicingFamily),
    preferredCenterMidi,
  }), midiRange, preferredCenterMidi ?? ((midiRange.min + midiRange.max) / 2));

  const inversion = voicingFamily === 'inversion_1'
    ? 1
    : (voicingFamily === 'inversion_2' ? 2 : null);
  const isFreeBottomVoicing = voicingFamily === 'guide_tone_37'
    || voicingFamily === 'guide_tone_73'
    || voicingFamily === 'rootless_379'
    || voicingFamily === 'rootless_7313'
    || voicingFamily === 'rootless';

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
    bassPolicy: voicingFamily === 'inversion_1' || voicingFamily === 'inversion_2' || voicingFamily === 'slash'
      ? 'exact'
      : (isFreeBottomVoicing ? 'any_allowed' : 'allow_inversion'),
    topNotePolicy: voicingFamily === 'inversion_1' || voicingFamily === 'inversion_2' ? 'preferred' : 'any_allowed',
    midiRange,
    midiVoicing,
  };
}
