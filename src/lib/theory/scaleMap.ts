import { getScaleOption } from '../../content/scales';
import type { ScaleId } from '../../types/music';
import { pitchClassToSemitone, semitoneToPitchClass } from './noteUtils';

const MAJOR_DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

function intervalToSemitone(interval: string): number {
  const match = interval.match(/^([b#]*)(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported interval token: ${interval}`);
  }

  const [, accidentalText, degreeText] = match;
  const degree = Number.parseInt(degreeText, 10);
  const base = MAJOR_DEGREE_SEMITONES[(degree - 1) % MAJOR_DEGREE_SEMITONES.length];

  let accidental = 0;
  for (const symbol of accidentalText) {
    if (symbol === 'b') accidental -= 1;
    if (symbol === '#') accidental += 1;
  }

  return base + accidental;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function mergeDegreeMaps(
  current: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  return Object.entries(incoming).reduce<Record<string, string>>((result, [pitchClass, degreeLabel]) => {
    if (!(pitchClass in result)) {
      result[pitchClass] = degreeLabel;
    }
    return result;
  }, { ...current });
}

export function pitchClassesForScale(rootPitchClass: string, scaleId: ScaleId): string[] {
  const scale = getScaleOption(scaleId);
  const rootSemitone = pitchClassToSemitone(rootPitchClass);
  return unique(scale.intervalFormula.map((interval) => semitoneToPitchClass(rootSemitone + intervalToSemitone(interval))));
}

export function degreeLabelsForScale(rootPitchClass: string, scaleId: ScaleId): Record<string, string> {
  const scale = getScaleOption(scaleId);
  const rootSemitone = pitchClassToSemitone(rootPitchClass);

  return scale.intervalFormula.reduce<Record<string, string>>((result, interval) => {
    result[semitoneToPitchClass(rootSemitone + intervalToSemitone(interval))] = interval;
    return result;
  }, {});
}

export function pitchClassesForScaleIds(rootPitchClass: string, scaleIds: ScaleId[]): string[] {
  return unique(scaleIds.flatMap((scaleId) => pitchClassesForScale(rootPitchClass, scaleId)));
}

export function degreeLabelsForScaleIds(rootPitchClass: string, scaleIds: ScaleId[]): Record<string, string> {
  return scaleIds.reduce<Record<string, string>>(
    (result, scaleId) => mergeDegreeMaps(result, degreeLabelsForScale(rootPitchClass, scaleId)),
    {},
  );
}

export function intersectPitchClasses(a: string[], b: string[]): string[] {
  const bSet = new Set(b);
  return unique(a.filter((pitchClass) => bSet.has(pitchClass)));
}
