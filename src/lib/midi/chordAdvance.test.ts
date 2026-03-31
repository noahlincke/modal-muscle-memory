import { describe, expect, it } from 'vitest';
import { carryoverNotesAfterAdvance, hasAcceptedNotesStillHeld } from './chordAdvance';

describe('chordAdvance', () => {
  it('waits only for accepted chord notes to release', () => {
    expect(hasAcceptedNotesStillHeld([61, 65, 69], [60, 64, 67])).toBe(false);
    expect(hasAcceptedNotesStillHeld([60, 61, 65], [60, 64, 67])).toBe(true);
  });

  it('preserves overlapping notes as carryover for the next chord', () => {
    expect(carryoverNotesAfterAdvance([61, 65, 69], [60, 64, 67])).toEqual([61, 65, 69]);
    expect(carryoverNotesAfterAdvance([60, 61, 65, 67], [60, 64, 67])).toEqual([61, 65]);
  });
});
