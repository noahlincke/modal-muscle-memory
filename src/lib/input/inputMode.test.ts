import { describe, expect, it } from 'vitest';
import { resolveEffectiveInputMode } from './inputMode';

describe('resolveEffectiveInputMode', () => {
  it('prefers MIDI while auto mode has a connected device', () => {
    expect(resolveEffectiveInputMode({
      preferredInputMode: 'auto',
      midiReady: true,
    })).toBe('midi');
  });

  it('falls back to mic when auto mode has no MIDI device', () => {
    expect(resolveEffectiveInputMode({
      preferredInputMode: 'auto',
      midiReady: false,
    })).toBe('mic');
  });

  it('keeps qwerty pinned regardless of MIDI availability', () => {
    expect(resolveEffectiveInputMode({
      preferredInputMode: 'qwerty',
      midiReady: true,
    })).toBe('qwerty');
  });
});
