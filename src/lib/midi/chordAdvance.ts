export function hasAcceptedNotesStillHeld(
  activeNotes: Iterable<number>,
  acceptedNotes: number[],
): boolean {
  const active = new Set(activeNotes);
  return acceptedNotes.some((note) => active.has(note));
}

export function carryoverNotesAfterAdvance(
  activeNotes: Iterable<number>,
  acceptedNotes: number[],
): number[] {
  const accepted = new Set(acceptedNotes);
  return Array.from(new Set(activeNotes))
    .filter((note) => !accepted.has(note))
    .sort((a, b) => a - b);
}
