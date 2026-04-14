function unique(items: string[]): string[] {
  return [...new Set(items)];
}

export function filterMicOverlapPitchClasses(
  detectedPitchClasses: string[],
  allowedPitchClasses: string[],
  overlapPitchClasses: string[],
): string[] {
  if (detectedPitchClasses.length === 0 || overlapPitchClasses.length === 0) {
    return unique(detectedPitchClasses);
  }

  const allowed = new Set(allowedPitchClasses);
  const overlap = new Set(overlapPitchClasses);

  return unique(detectedPitchClasses.filter((pitchClass) => (
    !overlap.has(pitchClass) || allowed.has(pitchClass)
  )));
}
