import { describe, expect, it } from 'vitest';
import { metronomePhaseForBeatOffset } from './metronome';

describe('metronomePhaseForBeatOffset', () => {
  it('starts immediately on downbeats', () => {
    expect(metronomePhaseForBeatOffset(0)).toEqual({
      nextQuarterIndex: 0,
      startDelayBeats: 0,
    });

    expect(metronomePhaseForBeatOffset(4)).toEqual({
      nextQuarterIndex: 4,
      startDelayBeats: 0,
    });
  });

  it('waits for the next quarter note when starting from an offbeat', () => {
    expect(metronomePhaseForBeatOffset(1.5)).toEqual({
      nextQuarterIndex: 2,
      startDelayBeats: 0.5,
    });

    expect(metronomePhaseForBeatOffset(2.25)).toEqual({
      nextQuarterIndex: 3,
      startDelayBeats: 0.75,
    });
  });

  it('clamps invalid offsets to the bar origin', () => {
    expect(metronomePhaseForBeatOffset(-3)).toEqual({
      nextQuarterIndex: 0,
      startDelayBeats: 0,
    });

    expect(metronomePhaseForBeatOffset(Number.NaN)).toEqual({
      nextQuarterIndex: 0,
      startDelayBeats: 0,
    });
  });
});
