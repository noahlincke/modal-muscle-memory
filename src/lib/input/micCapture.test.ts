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

    const first = capture.ingestScale(observation(261.63, 10));

    expect(first.stableEvent?.pitchClass).toBe('C');
    expect([...capture.activeNoteNumbers]).toEqual([60]);
  });

  it('tracks the latest stable note as active in scale mode', () => {
    const capture = new MicCapture();

    capture.ingestScale(observation(261.63, 10));
    capture.ingestScale(observation(329.63, 190));

    expect([...capture.activeNoteNumbers]).toEqual([64]);
  });

  it('releases the active note after silence', () => {
    const capture = new MicCapture();

    capture.ingestScale(observation(261.63, 10));
    const silence = capture.ingestScale(observation(null, 240, { rms: 0 }));

    expect(silence.activeChanged).toBe(true);
    expect(capture.activeNoteNumbers.size).toBe(0);
  });

  it('allows quick repeated strikes of the same note', () => {
    const capture = new MicCapture();

    const first = capture.ingestScale(observation(261.63, 10));
    capture.ingestScale(observation(null, 80, { rms: 0 }));
    const second = capture.ingestScale(observation(261.63, 140));

    expect(first.stableEvent?.pitchClass).toBe('C');
    expect(second.stableEvent?.pitchClass).toBe('C');
  });

  it('accepts quieter note frames', () => {
    const capture = new MicCapture();

    const result = capture.ingestScale(observation(261.63, 10, { clarity: 0.72, rms: 0.0055 }));

    expect(result.stableEvent?.pitchClass).toBe('C');
  });

  it('accepts slightly less clear scale frames', () => {
    const capture = new MicCapture();

    const result = capture.ingestScale(observation(261.63, 10, { clarity: 0.65, rms: 0.0046 }));

    expect(result.stableEvent?.pitchClass).toBe('C');
  });

  it('accepts quieter scale notes that would previously be dropped', () => {
    const capture = new MicCapture();

    const result = capture.ingestScale(observation(293.66, 10, { clarity: 0.61, rms: 0.0038 }));

    expect(result.stableEvent?.pitchClass).toBe('D');
  });

  it('accepts very weak but still tonal scale frames', () => {
    const capture = new MicCapture();

    const result = capture.ingestScale(observation(392, 10, { clarity: 0.5, rms: 0.0024 }));

    expect(result.stableEvent?.pitchClass).toBe('G');
  });

  it('builds a chord submission from a fresh volume burst', () => {
    const capture = new MicCapture();

    capture.ingestChord(observation(null, 0, { rms: 0.001 }), ['C', 'E', 'G']);
    capture.ingestChord(observation(261.63, 10, { rms: 0.011 }), ['C', 'E', 'G']);
    capture.ingestChord(observation(329.63, 42, { rms: 0.008 }), ['C', 'E', 'G']);
    const closed = capture.ingestChord(observation(null, 180, { rms: 0.001 }), ['C', 'E', 'G']);

    expect(closed.submission).not.toBeNull();
    expect(closed.submission?.reason).toBe('burst_closed');
    expect(closed.submission?.pitchClasses).toEqual(['C', 'E']);
  });

  it('does not start a chord burst from a small volume wobble above baseline', () => {
    const capture = new MicCapture();

    capture.ingestChord(observation(null, 0, { rms: 0.0031 }), ['C', 'E', 'G']);
    capture.ingestChord(observation(261.63, 10, { clarity: 0.82, rms: 0.0055 }), ['C', 'E', 'G']);
    const closed = capture.ingestChord(observation(null, 180, { rms: 0.0028 }), ['C', 'E', 'G']);

    expect(closed.submission).toBeNull();
  });

  it('rejects weak single-pitch chord bursts without enough tonal evidence', () => {
    const capture = new MicCapture();

    capture.ingestChord(observation(null, 0, { rms: 0.001 }), ['C', 'E', 'G']);
    capture.ingestChord(observation(261.63, 10, { clarity: 0.71, rms: 0.0105 }), ['C', 'E', 'G']);
    const closed = capture.ingestChord(observation(null, 180, { rms: 0.001 }), ['C', 'E', 'G']);

    expect(closed.submission).toBeNull();
  });

  it('rejects very clear single-pitch chord bursts when the peak is not strong enough', () => {
    const capture = new MicCapture();

    capture.ingestChord(observation(null, 0, { rms: 0.001 }), ['C', 'E', 'G']);
    capture.ingestChord(observation(261.63, 10, { clarity: 0.93, rms: 0.0102 }), ['C', 'E', 'G']);
    const closed = capture.ingestChord(observation(null, 180, { rms: 0.001 }), ['C', 'E', 'G']);

    expect(closed.submission).toBeNull();
  });

  it('does not emit repeated submissions from one sustained chord burst', () => {
    const capture = new MicCapture();

    capture.ingestChord(observation(null, 0, { rms: 0.001 }), ['C', 'E', 'G']);
    capture.ingestChord(observation(261.63, 10, { rms: 0.011 }), ['C', 'E', 'G']);
    capture.ingestChord(observation(329.63, 42, { rms: 0.008 }), ['C', 'E', 'G']);
    const first = capture.ingestChord(observation(null, 180, { rms: 0.001 }), ['C', 'E', 'G']);
    const second = capture.ingestChord(observation(null, 320, { rms: 0.001 }), ['C', 'E', 'G']);

    expect(first.submission).not.toBeNull();
    expect(second.submission).toBeNull();
  });

  it('requires a sustained quiet reset and longer cooldown before a new chord burst can trigger again', () => {
    const capture = new MicCapture();

    capture.ingestChord(observation(null, 0, { rms: 0.001 }), ['C', 'E', 'G']);
    capture.ingestChord(observation(261.63, 10, { rms: 0.014 }), ['C', 'E', 'G']);
    capture.ingestChord(observation(329.63, 36, { rms: 0.009 }), ['C', 'E', 'G']);
    const first = capture.ingestChord(observation(null, 190, { rms: 0.001 }), ['C', 'E', 'G']);

    capture.ingestChord(observation(392.0, 300, { rms: 0.0108 }), ['G', 'B', 'D']);
    const noSecond = capture.ingestChord(observation(null, 460, { rms: 0.0048 }), ['G', 'B', 'D']);
    capture.ingestChord(observation(null, 640, { rms: 0.0012 }), ['G', 'B', 'D']);
    capture.ingestChord(observation(null, 860, { rms: 0.0011 }), ['G', 'B', 'D']);
    capture.ingestChord(observation(392.0, 900, { clarity: 0.92, rms: 0.0135 }), ['G', 'B', 'D']);
    const second = capture.ingestChord(observation(null, 1080, { rms: 0.0012 }), ['G', 'B', 'D']);

    expect(first.submission).not.toBeNull();
    expect(noSecond.submission).toBeNull();
    expect(second.submission?.pitchClasses).toEqual(['G']);
  });

  it('does not retrigger from a small post-chord wobble without enough fresh rise', () => {
    const capture = new MicCapture();

    capture.ingestChord(observation(null, 0, { rms: 0.001 }), ['C', 'E', 'G']);
    capture.ingestChord(observation(261.63, 10, { rms: 0.014 }), ['C', 'E', 'G']);
    capture.ingestChord(observation(329.63, 36, { rms: 0.0092 }), ['C', 'E', 'G']);
    const first = capture.ingestChord(observation(null, 190, { rms: 0.001 }), ['C', 'E', 'G']);

    capture.ingestChord(observation(null, 430, { rms: 0.0054 }), ['G', 'B', 'D']);
    capture.ingestChord(observation(392.0, 520, { clarity: 0.93, rms: 0.0078 }), ['G', 'B', 'D']);
    const noSecond = capture.ingestChord(observation(null, 690, { rms: 0.0036 }), ['G', 'B', 'D']);

    expect(first.submission).not.toBeNull();
    expect(noSecond.submission).toBeNull();
  });
});
