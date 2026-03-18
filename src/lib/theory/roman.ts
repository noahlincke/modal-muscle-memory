import { Note } from 'tonal';
import { pitchClassToSemitone, semitoneToPitchClass } from './noteUtils';

const DEGREE_BY_ROMAN: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
};

const MAJOR_DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

export interface ParsedRoman {
  accidental: number;
  degree: number;
  numeral: string;
  suffix: string;
}

export interface RomanResolution {
  rootPitchClass: string;
  quality: 'maj7' | 'm7' | '7' | 'm7b5' | 'maj' | 'min';
  symbol: string;
}

export function parseRoman(roman: string): ParsedRoman {
  const match = roman.match(/^([b#]*)([ivIV]+)(.*)$/);
  if (!match) {
    throw new Error(`Unsupported roman numeral token: ${roman}`);
  }

  const [, accidentalText, numeral, suffix] = match;
  const degree = DEGREE_BY_ROMAN[numeral.toUpperCase()];
  if (!degree) {
    throw new Error(`Unknown roman numeral degree: ${roman}`);
  }

  let accidental = 0;
  for (const symbol of accidentalText) {
    if (symbol === 'b') accidental -= 1;
    if (symbol === '#') accidental += 1;
  }

  return {
    accidental,
    degree,
    numeral,
    suffix: suffix.trim(),
  };
}

function inferQuality(parsed: ParsedRoman): RomanResolution['quality'] {
  const suffix = parsed.suffix;
  const numeralIsMinor = parsed.numeral[0] === parsed.numeral[0].toLowerCase();

  if (suffix.includes('maj7')) {
    return 'maj7';
  }

  if (suffix.includes('ø') || suffix.includes('m7b5')) {
    return 'm7b5';
  }

  if (suffix.includes('m7')) {
    return 'm7';
  }

  if (suffix === '7' || suffix.endsWith('7')) {
    return numeralIsMinor ? 'm7' : '7';
  }

  if (suffix.includes('m')) {
    return 'min';
  }

  return numeralIsMinor ? 'min' : 'maj';
}

export function qualityToSymbolSuffix(
  quality: RomanResolution['quality'],
): string {
  switch (quality) {
    case 'maj7':
      return 'maj7';
    case 'm7':
      return 'm7';
    case '7':
      return '7';
    case 'm7b5':
      return 'm7b5';
    case 'min':
      return 'm';
    case 'maj':
    default:
      return '';
  }
}

export function resolveRomanToChord(tonic: string, roman: string): RomanResolution {
  const tonicPitch = Note.pitchClass(tonic) ?? tonic;
  const parsed = parseRoman(roman);
  const tonicSemitone = pitchClassToSemitone(tonicPitch);
  const degreeSemitone = MAJOR_DEGREE_SEMITONES[parsed.degree - 1] + parsed.accidental;
  const rootSemitone = tonicSemitone + degreeSemitone;

  const rootPitchClass = semitoneToPitchClass(rootSemitone);
  const quality = inferQuality(parsed);
  const symbol = `${rootPitchClass}${qualityToSymbolSuffix(quality)}`;

  return {
    rootPitchClass,
    quality,
    symbol,
  };
}
