import { describe, expect, it } from 'vitest';
import { ScaleCapture } from './scaleCapture';
import { parseMidiMessage } from './midiParser';

describe('scale capture', () => {
  it('submits note-on messages for sequential scale evaluation', () => {
    const capture = new ScaleCapture();
    const submission = capture.ingest(parseMidiMessage(new Uint8Array([0x90, 60, 100]), 10));

    expect(submission).toEqual({
      noteNumber: 60,
      timestamp: 10,
    });
  });

  it('ignores repeated note-ons while the same note is still held', () => {
    const capture = new ScaleCapture();

    capture.ingest(parseMidiMessage(new Uint8Array([0x90, 60, 100]), 10));
    const repeated = capture.ingest(parseMidiMessage(new Uint8Array([0x90, 60, 100]), 20));

    expect(repeated).toBeNull();
  });

  it('releases active notes on note-off without sustain', () => {
    const capture = new ScaleCapture();

    capture.ingest(parseMidiMessage(new Uint8Array([0x90, 60, 100]), 10));
    capture.ingest(parseMidiMessage(new Uint8Array([0x80, 60, 0]), 20));

    expect(capture.activeNoteNumbers.size).toBe(0);
    expect(capture.heldNoteNumbers.size).toBe(0);
  });
});
