import { describe, expect, it } from 'vitest';
import {
  createSyntheticNoteMessage,
  defaultQwertyOctaveShiftForClef,
  noteNumberForBinding,
  octaveShiftForAction,
  qwertyFriendlyRangeForOctaveShift,
  qwertyAnchorLabel,
  qwertyBindingForKey,
} from './qwertyInput';

describe('qwertyInput', () => {
  it('maps A to C4 by default', () => {
    const binding = qwertyBindingForKey('a');
    expect(binding).not.toBeNull();
    expect(noteNumberForBinding(binding!, 0)).toBe(60);
  });

  it('supports octave shifts around the fixed home-row mapping', () => {
    const binding = qwertyBindingForKey('a');
    expect(binding).not.toBeNull();
    expect(noteNumberForBinding(binding!, -1)).toBe(48);
    expect(noteNumberForBinding(binding!, 1)).toBe(72);
    expect(qwertyAnchorLabel(-1)).toBe('A = C3');
    expect(defaultQwertyOctaveShiftForClef('bass')).toBe(-2);
    expect(qwertyFriendlyRangeForOctaveShift(-2)).toEqual({ min: 36, max: 55 });
  });

  it('normalizes octave controls and emits note messages', () => {
    expect(octaveShiftForAction(0, 'octave_down')).toBe(-1);
    expect(octaveShiftForAction(-2, 'octave_down')).toBe(-2);
    expect(octaveShiftForAction(1, 'octave_up')).toBe(1);

    expect(createSyntheticNoteMessage('note_on', 60, 10)).toMatchObject({
      type: 'note_on',
      noteNumber: 60,
      pitchClass: 'C',
    });
    expect(createSyntheticNoteMessage('note_off', 61, 20)).toMatchObject({
      type: 'note_off',
      noteNumber: 61,
      pitchClass: 'C#',
    });
  });
});
