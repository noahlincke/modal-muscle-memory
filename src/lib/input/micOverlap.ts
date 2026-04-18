interface FilterMicOverlapOptions {
  preserveAllowedOverlap?: boolean;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

export function filterMicOverlapPitchClasses(
  detectedPitchClasses: string[],
  allowedPitchClasses: string[],
  overlapPitchClasses: string[],
  options: FilterMicOverlapOptions = {},
): string[] {
  if (detectedPitchClasses.length === 0 || overlapPitchClasses.length === 0) {
    return unique(detectedPitchClasses);
  }

  const allowed = new Set(allowedPitchClasses);
  const overlap = new Set(overlapPitchClasses);
  const preserveAllowedOverlap = options.preserveAllowedOverlap ?? false;

  return unique(detectedPitchClasses.filter((pitchClass) => (
    !overlap.has(pitchClass) || (preserveAllowedOverlap && allowed.has(pitchClass))
  )));
}
