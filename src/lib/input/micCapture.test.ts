import { describe, expect, it } from 'vitest';
import { MicCapture } from './micCapture';

function observation(
  frequency: number | null,
  timestamp: number,
  overrides: { clarity?: number; rms?: number } = {},
) {
  return {
    frequency,
    timestamp,
    clarity: overrides.clarity ?? 0.95,
    rms: overrides.rms ?? 0.03,
  };
}

describe('MicCapture', () => {
  it('emits a stable note on the first strong frame', () => {
    const capture = new MicCapture();

    const first = capture.ingest(observation(261.63, 10));

    expect(first.stableEvent?.pitchClass).toBe('C');
    expect([...capture.activeNoteNumbers]).toEqual([60]);
  });

  it('builds forgiving chord submissions from recent stable notes', () => {
    const capture = new MicCapture();

    capture.ingest(observation(261.63, 10));
    capture.ingest(observation(329.63, 190));

    const submission = capture.maybeBuildSubmission(['C', 'E', 'G'], 220);

    expect(submission).not.toBeNull();
    expect(submission?.pitchClasses).toEqual(['C', 'E']);
  });

  it('releases the active note after silence', () => {
    const capture = new MicCapture();

    capture.ingest(observation(261.63, 10));
    const silence = capture.ingest(observation(null, 240, { rms: 0 }));

    expect(silence.activeChanged).toBe(true);
    expect(capture.activeNoteNumbers.size).toBe(0);
  });

  it('allows quick repeated strikes of the same note', () => {
    const capture = new MicCapture();

    const first = capture.ingest(observation(261.63, 10));
    capture.ingest(observation(null, 80, { rms: 0 }));
    const second = capture.ingest(observation(261.63, 140));

    expect(first.stableEvent?.pitchClass).toBe('C');
    expect(second.stableEvent?.pitchClass).toBe('C');
  });
});
