import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { PianoView } from './PianoView';

type PianoViewProps = ComponentProps<typeof PianoView>;

const baseProps: PianoViewProps = {
  tonic: null,
  mode: 'guided',
  clef: 'treble',
  minMidi: 21,
  maxMidi: 108,
  targetNotes: [],
  chordTonePitchClasses: [],
  currentScalePitchClasses: [],
  currentScaleGuideLabels: {},
  nextScalePitchClasses: [],
  nextScaleGuideLabels: {},
  activeNotes: new Set<number>(),
  highlightColor: '#0454d5',
};

function renderPiano(overrides: Partial<PianoViewProps> = {}) {
  const onNoteOn = vi.fn();
  const onNoteOff = vi.fn();
  const view = render(<PianoView {...baseProps} onNoteOn={onNoteOn} onNoteOff={onNoteOff} {...overrides} />);
  return { ...view, onNoteOn, onNoteOff };
}

function keyElement(midi: number): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-midi="${midi}"]`);
  if (!element) {
    throw new Error(`missing key ${midi}`);
  }
  return element;
}

afterEach(cleanup);

describe('PianoView pointer input', () => {
  it('sends noteOn on pointerdown and noteOff on pointerup', () => {
    const { onNoteOn, onNoteOff } = renderPiano();

    fireEvent.pointerDown(keyElement(60), { pointerId: 1, pointerType: 'touch', clientY: 8 });
    expect(onNoteOn).toHaveBeenCalledTimes(1);
    const [midi, velocity] = onNoteOn.mock.calls[0];
    expect(midi).toBe(60);
    expect(velocity).toBeGreaterThanOrEqual(0.55);
    expect(velocity).toBeLessThanOrEqual(0.9);

    fireEvent.pointerUp(keyElement(60), { pointerId: 1 });
    expect(onNoteOff).toHaveBeenCalledTimes(1);
    expect(onNoteOff).toHaveBeenCalledWith(60);
  });

  it('uses velocity 0.75 for mouse pointers', () => {
    const { onNoteOn } = renderPiano();

    fireEvent.pointerDown(keyElement(62), { pointerId: 1, pointerType: 'mouse' });
    expect(onNoteOn).toHaveBeenCalledWith(62, 0.75);
  });

  it('holds one note per pointer for two simultaneous fingers', () => {
    const { onNoteOn, onNoteOff } = renderPiano();

    fireEvent.pointerDown(keyElement(60), { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerDown(keyElement(64), { pointerId: 2, pointerType: 'touch' });
    expect(onNoteOn).toHaveBeenNthCalledWith(1, 60, expect.any(Number));
    expect(onNoteOn).toHaveBeenNthCalledWith(2, 64, expect.any(Number));

    fireEvent.pointerUp(keyElement(60), { pointerId: 1 });
    expect(onNoteOff).toHaveBeenCalledTimes(1);
    expect(onNoteOff).toHaveBeenCalledWith(60);

    fireEvent.pointerUp(keyElement(64), { pointerId: 2 });
    expect(onNoteOff).toHaveBeenNthCalledWith(2, 64);
  });

  it('glissandos via pointermove hit-testing with elementFromPoint', () => {
    const { onNoteOn, onNoteOff } = renderPiano();
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => keyElement(64);

    try {
      fireEvent.pointerDown(keyElement(60), { pointerId: 3, pointerType: 'touch', clientX: 10, clientY: 10 });
      expect(onNoteOn).toHaveBeenCalledWith(60, expect.any(Number));

      fireEvent.pointerMove(keyElement(60), { pointerId: 3, pointerType: 'touch', clientX: 40, clientY: 10 });
      expect(onNoteOff).toHaveBeenCalledTimes(1);
      expect(onNoteOff).toHaveBeenCalledWith(60);
      expect(onNoteOn).toHaveBeenLastCalledWith(64, expect.any(Number));
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
  });

  it('does not double-trigger when two fingers hold the same note', () => {
    const { onNoteOn, onNoteOff } = renderPiano();

    fireEvent.pointerDown(keyElement(60), { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerDown(keyElement(60), { pointerId: 2, pointerType: 'touch' });
    expect(onNoteOn).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(keyElement(60), { pointerId: 1 });
    expect(onNoteOff).not.toHaveBeenCalled();

    fireEvent.pointerUp(keyElement(60), { pointerId: 2 });
    expect(onNoteOff).toHaveBeenCalledTimes(1);
    expect(onNoteOff).toHaveBeenCalledWith(60);
  });

  it('releases every held pointer on window blur', () => {
    const { onNoteOn, onNoteOff } = renderPiano();

    fireEvent.pointerDown(keyElement(60), { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerDown(keyElement(64), { pointerId: 2, pointerType: 'touch' });
    expect(onNoteOn).toHaveBeenCalledTimes(2);

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(onNoteOff).toHaveBeenCalledTimes(2);

    fireEvent.pointerUp(keyElement(60), { pointerId: 1 });
    expect(onNoteOff).toHaveBeenCalledTimes(2);
  });

  it('marks held keys with is-pressed and clears on release', () => {
    const { onNoteOff } = renderPiano();

    fireEvent.pointerDown(keyElement(60), { pointerId: 1, pointerType: 'touch' });
    expect(keyElement(60).className).toContain('is-pressed');

    fireEvent.pointerUp(keyElement(60), { pointerId: 1 });
    expect(keyElement(60).className).not.toContain('is-pressed');
    expect(onNoteOff).toHaveBeenCalledTimes(1);
  });

  it('stays display-only without the callback props', () => {
    render(<PianoView {...baseProps} />);

    const stage = document.querySelector('.piano-stage');
    expect(stage?.className).not.toContain('is-playable');

    expect(() => {
      fireEvent.pointerDown(keyElement(60), { pointerId: 1, pointerType: 'touch' });
      fireEvent.pointerUp(keyElement(60), { pointerId: 1 });
    }).not.toThrow();
  });

  it('shows octave shift controls when the range is narrower than the full keyboard', () => {
    const { getByRole } = renderPiano({ minWhiteKeyWidth: 1000 });

    expect(getByRole('button', { name: 'Lower octave' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Higher octave' })).toBeInTheDocument();
  });

  it('shifts the visible range with the octave controls', () => {
    const { getByRole } = renderPiano({ minWhiteKeyWidth: 1000 });

    expect(document.querySelector('[data-midi="60"]')).not.toBeNull();
    fireEvent.click(getByRole('button', { name: 'Lower octave' }));
    expect(document.querySelector('[data-midi="48"]')).not.toBeNull();
    expect(document.querySelector('[data-midi="60"]')).toBeNull();
  });
});
