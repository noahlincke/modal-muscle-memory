export type StaffClef = 'treble' | 'bass';

export interface MidiRange {
  min: number;
  max: number;
}

const IDEAL_REGISTER_BY_CLEF: Record<StaffClef, MidiRange> = {
  treble: { min: 60, max: 84 },
  bass: { min: 31, max: 55 },
};

function overlapRange(a: MidiRange, b: MidiRange): MidiRange | null {
  const min = Math.max(a.min, b.min);
  const max = Math.min(a.max, b.max);
  return min <= max ? { min, max } : null;
}

function voicingCenter(notes: number[]): number {
  if (notes.length === 0) {
    return 0;
  }

  return (notes[0] + notes[notes.length - 1]) / 2;
}

export function registerForClef(clef: StaffClef): MidiRange {
  return IDEAL_REGISTER_BY_CLEF[clef];
}

export function preferredCenterForClef(
  clef: StaffClef,
  midiRange: MidiRange,
): number {
  const comfortRange = overlapRange(midiRange, IDEAL_REGISTER_BY_CLEF[clef]) ?? midiRange;
  const bias = clef === 'treble' ? 0.75 : 0.2;
  return comfortRange.min + ((comfortRange.max - comfortRange.min) * bias);
}

export function transposeVoicingByOctaveTowardCenter(
  notes: number[],
  midiRange: MidiRange,
  targetCenter: number,
): number[] {
  if (notes.length === 0) {
    return notes;
  }

  let best = [...notes];
  let bestDistance = Math.abs(voicingCenter(best) - targetCenter);
  let bestShift = 0;

  for (let shift = -60; shift <= 60; shift += 12) {
    const shifted = notes.map((note) => note + shift);
    const withinRange = shifted.every((note) => note >= midiRange.min && note <= midiRange.max);
    if (!withinRange) {
      continue;
    }

    const distance = Math.abs(voicingCenter(shifted) - targetCenter);
    if (distance < bestDistance || (distance === bestDistance && Math.abs(shift) < Math.abs(bestShift))) {
      best = shifted;
      bestDistance = distance;
      bestShift = shift;
    }
  }

  return best;
}
