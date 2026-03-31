import { describe, expect, it } from 'vitest';
import { ChordCapture } from './chordCapture';
import { parseMidiMessage } from './midiParser';

describe('midi parser + chord capture', () => {
  it('parses note on/off and sustain messages', () => {
    const on = parseMidiMessage(new Uint8Array([0x90, 60, 100]), 1);
    const off = parseMidiMessage(new Uint8Array([0x80, 60, 0]), 2);
    const sustain = parseMidiMessage(new Uint8Array([0xb0, 64, 127]), 3);

    expect(on.type).toBe('note_on');
    expect(off.type).toBe('note_off');
    expect(sustain.type).toBe('sustain');
  });

  it('submits when required pitch classes are present', () => {
    const capture = new ChordCapture({ simultaneityWindowMs: 90 });

    capture.ingest(parseMidiMessage(new Uint8Array([0x90, 60, 100]), 10), ['C', 'E', 'G']);
    capture.ingest(parseMidiMessage(new Uint8Array([0x90, 64, 100]), 20), ['C', 'E', 'G']);
    const submission = capture.ingest(parseMidiMessage(new Uint8Array([0x90, 67, 100]), 30), ['C', 'E', 'G']);

    expect(submission).not.toBeNull();
    expect(submission?.reason).toBe('required_detected');
  });

  it('submits on burst close when idle longer than simultaneity window', () => {
    const capture = new ChordCapture({ simultaneityWindowMs: 50 });

    capture.ingest(parseMidiMessage(new Uint8Array([0x90, 60, 90]), 100));
    const none = capture.flush(130);
    const submission = capture.flush(180);

    expect(none).toBeNull();
    expect(submission).not.toBeNull();
    expect(submission?.reason).toBe('burst_closed');
  });

  it('submits using held notes instead of sustained carryover notes', () => {
    const capture = new ChordCapture({ simultaneityWindowMs: 90 });

    capture.ingest(parseMidiMessage(new Uint8Array([0xb0, 64, 127]), 1));
    capture.ingest(parseMidiMessage(new Uint8Array([0x90, 60, 100]), 10), ['C', 'E', 'G']);
    capture.ingest(parseMidiMessage(new Uint8Array([0x90, 64, 100]), 20), ['C', 'E', 'G']);
    capture.ingest(parseMidiMessage(new Uint8Array([0x90, 67, 100]), 30), ['C', 'E', 'G']);
    capture.ingest(parseMidiMessage(new Uint8Array([0x80, 60, 0]), 40));
    capture.ingest(parseMidiMessage(new Uint8Array([0x80, 64, 0]), 50));
    capture.ingest(parseMidiMessage(new Uint8Array([0x80, 67, 0]), 60));

    capture.ingest(parseMidiMessage(new Uint8Array([0x90, 62, 100]), 70), ['D', 'F', 'A']);
    capture.ingest(parseMidiMessage(new Uint8Array([0x90, 65, 100]), 80), ['D', 'F', 'A']);
    const submission = capture.ingest(parseMidiMessage(new Uint8Array([0x90, 69, 100]), 90), ['D', 'F', 'A']);

    expect(submission).not.toBeNull();
    expect(submission?.notes).toEqual([62, 65, 69]);
  });
});
