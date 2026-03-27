import { type CSSProperties, useMemo } from 'react';
import { Midi } from 'tonal';
import { intervalColorForTonicAndRoot } from '../lib/theory/intervalRing';
import type { ExerciseMode } from '../types/music';
import {
  noteNumberForBinding,
  QWERTY_NOTE_BINDINGS,
} from '../lib/input/qwertyInput';
import { midiToPitchClass } from '../lib/theory/noteUtils';

interface QwertyViewProps {
  tonic: string | null;
  mode: ExerciseMode;
  clef: 'treble' | 'bass';
  octaveShift: number;
  targetNotes: number[];
  chordTonePitchClasses: string[];
  currentScalePitchClasses: string[];
  currentScaleGuideLabels: Record<string, string>;
  nextScalePitchClasses: string[];
  nextScaleGuideLabels: Record<string, string>;
  activeNotes: Set<number>;
  highlightColor: string;
}

interface RenderKey {
  midi: number;
  qwertyLabel: string;
  noteName: string;
  centerX: number;
  isBlack: boolean;
  left: number;
  right: number;
}

interface GuideMarker {
  midi: number;
  label: string;
}

const WHITE_KEY_WIDTH = 42;
const BLACK_KEY_WIDTH = 28;

function withAlpha(hexColor: string, alpha: number): string {
  const match = hexColor.match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return hexColor;
  }

  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function splitGuideLabel(label: string): {
  prefixAccidental: string;
  body: string;
  suffixAccidental: string;
} {
  const noteNameMatch = label.match(/^([A-G])([b#]+)$/);
  if (noteNameMatch) {
    return {
      prefixAccidental: '',
      body: noteNameMatch[1],
      suffixAccidental: noteNameMatch[2],
    };
  }

  const degreeMatch = label.match(/^([b#]+)(.+)$/);
  if (degreeMatch) {
    return {
      prefixAccidental: degreeMatch[1],
      body: degreeMatch[2],
      suffixAccidental: '',
    };
  }

  return {
    prefixAccidental: '',
    body: label,
    suffixAccidental: '',
  };
}

function ScaleGuideLabel({ label }: { label: string }) {
  const parts = splitGuideLabel(label);
  const hasAccidental = Boolean(parts.prefixAccidental || parts.suffixAccidental);

  return (
    <span className={`scale-guide-label ${hasAccidental ? 'has-accidental' : ''}`.trim()}>
      {parts.prefixAccidental ? (
        <span className="scale-guide-accidental prefix">{parts.prefixAccidental}</span>
      ) : null}
      <span className="scale-guide-body">{parts.body}</span>
      {parts.suffixAccidental ? (
        <span className="scale-guide-accidental suffix">{parts.suffixAccidental}</span>
      ) : null}
    </span>
  );
}

function orderedGuideEntries(guideLabels: Record<string, string>): Array<[string, string]> {
  return Object.entries(guideLabels);
}

function findNearestMidiAtOrAbove(keys: RenderKey[], startMidi: number, pitchClass: string): number | null {
  const match = keys.find((key) => key.midi >= startMidi && midiToPitchClass(key.midi) === pitchClass);
  return match?.midi ?? null;
}

function findNearestMidiAtOrBelow(keys: RenderKey[], startMidi: number, pitchClass: string): number | null {
  const descending = [...keys].sort((left, right) => right.midi - left.midi);
  const match = descending.find((key) => key.midi <= startMidi && midiToPitchClass(key.midi) === pitchClass);
  return match?.midi ?? null;
}

function buildGuideMarkers(
  guideLabels: Record<string, string>,
  clef: 'treble' | 'bass',
  keys: RenderKey[],
  targetNotes: number[],
): GuideMarker[] {
  const entries = orderedGuideEntries(guideLabels);
  if (entries.length === 0) {
    return [];
  }

  const anchorPitchClass = entries[0][0];
  const chordLow = targetNotes.length > 0 ? Math.min(...targetNotes) : 60;
  const chordHigh = targetNotes.length > 0 ? Math.max(...targetNotes) : 60;
  const anchorSearchStart = clef === 'bass' ? chordHigh + 12 : chordLow - 12;
  const startMidi = (clef === 'bass'
    ? findNearestMidiAtOrAbove(keys, anchorSearchStart, anchorPitchClass)
    : findNearestMidiAtOrBelow(keys, anchorSearchStart, anchorPitchClass))
    ?? (clef === 'bass'
      ? findNearestMidiAtOrBelow(keys, keys[keys.length - 1]?.midi ?? anchorSearchStart, anchorPitchClass)
      : findNearestMidiAtOrAbove(keys, keys[0]?.midi ?? anchorSearchStart, anchorPitchClass));

  if (startMidi === null) {
    return [];
  }

  const markers: GuideMarker[] = [{ midi: startMidi, label: entries[0][1] }];
  let previousMidi = startMidi;

  for (let index = 1; index < entries.length; index += 1) {
    const [pitchClass, label] = entries[index];
    const nextMidi = findNearestMidiAtOrAbove(keys, previousMidi + 1, pitchClass);
    if (nextMidi === null) {
      break;
    }

    markers.push({ midi: nextMidi, label });
    previousMidi = nextMidi;
  }

  return markers;
}

export function QwertyView({
  tonic,
  mode,
  clef,
  octaveShift,
  targetNotes,
  chordTonePitchClasses,
  currentScalePitchClasses,
  currentScaleGuideLabels,
  nextScalePitchClasses,
  nextScaleGuideLabels,
  activeNotes,
  highlightColor,
}: QwertyViewProps) {
  const whiteKeysBase = useMemo(
    () => QWERTY_NOTE_BINDINGS
      .filter((binding) => !binding.isBlack)
      .map<RenderKey>((binding, whiteIndex) => {
        const midi = noteNumberForBinding(binding, octaveShift);
        const left = whiteIndex * WHITE_KEY_WIDTH;
        const right = left + WHITE_KEY_WIDTH;
        return {
          midi,
          qwertyLabel: binding.label,
          noteName: Midi.midiToNoteName(midi, { sharps: true }) ?? `M${midi}`,
          centerX: left + (WHITE_KEY_WIDTH / 2),
          isBlack: false,
          left,
          right,
        };
      }),
    [octaveShift],
  );

  const blackKeys = useMemo(
    () => QWERTY_NOTE_BINDINGS.flatMap<RenderKey>((binding, bindingIndex) => {
      if (!binding.isBlack) {
        return [];
      }

      const whiteIndex = QWERTY_NOTE_BINDINGS
        .slice(0, bindingIndex)
        .filter((candidate) => !candidate.isBlack)
        .length;
      const midi = noteNumberForBinding(binding, octaveShift);
      const left = (whiteIndex * WHITE_KEY_WIDTH) - (BLACK_KEY_WIDTH / 2);
      const right = left + BLACK_KEY_WIDTH;
      return [{
        midi,
        qwertyLabel: binding.label,
        noteName: Midi.midiToNoteName(midi, { sharps: true }) ?? `M${midi}`,
        centerX: left + (BLACK_KEY_WIDTH / 2),
        isBlack: true,
        left,
        right,
      }];
    }),
    [octaveShift],
  );

  const whiteKeys = useMemo(() => whiteKeysBase.map((key) => {
    const midpoint = key.left + (WHITE_KEY_WIDTH / 2);
    let visibleLeft = key.left;
    let visibleRight = key.right;

    blackKeys.forEach((blackKey) => {
      const overlapsWhiteKey = blackKey.left < key.right && blackKey.right > key.left;
      if (!overlapsWhiteKey) {
        return;
      }

      if (blackKey.centerX < midpoint) {
        visibleLeft = Math.max(visibleLeft, blackKey.right);
      } else {
        visibleRight = Math.min(visibleRight, blackKey.left);
      }
    });

    const centerX = visibleRight > visibleLeft
      ? (visibleLeft + visibleRight) / 2
      : key.centerX;

    return {
      ...key,
      centerX,
    };
  }), [blackKeys, whiteKeysBase]);

  const keys = useMemo(() => [...whiteKeys, ...blackKeys].sort((a, b) => a.midi - b.midi), [whiteKeys, blackKeys]);
  const targetSet = new Set(targetNotes);
  const chordToneSet = useMemo(() => new Set(chordTonePitchClasses), [chordTonePitchClasses]);
  const currentScaleSet = useMemo(() => new Set(currentScalePitchClasses), [currentScalePitchClasses]);
  const nextScaleSet = useMemo(() => new Set(nextScalePitchClasses), [nextScalePitchClasses]);
  const allowedImprovisationSet = new Set([
    ...chordTonePitchClasses,
    ...currentScalePitchClasses,
    ...nextScalePitchClasses,
  ]);

  const nextGuideMarkers = useMemo(
    () => buildGuideMarkers(nextScaleGuideLabels, clef, keys, targetNotes),
    [clef, keys, nextScaleGuideLabels, targetNotes],
  );
  const currentGuideMarkers = useMemo(
    () => buildGuideMarkers(currentScaleGuideLabels, clef, keys, targetNotes),
    [clef, currentScaleGuideLabels, keys, targetNotes],
  );
  const currentGuideMidiSet = useMemo(
    () => new Set(currentGuideMarkers.map((marker) => marker.midi)),
    [currentGuideMarkers],
  );
  const nextGuideMidiSet = useMemo(
    () => new Set(nextGuideMarkers.map((marker) => marker.midi)),
    [nextGuideMarkers],
  );
  const labeledGuideMidiSet = useMemo(
    () => new Set([...currentGuideMidiSet, ...nextGuideMidiSet]),
    [currentGuideMidiSet, nextGuideMidiSet],
  );

  const stageWidth = `${whiteKeys.length * WHITE_KEY_WIDTH}px`;

  function toneClass(active: boolean, midi: number): string {
    if (!active) {
      return '';
    }

    if (mode === 'guided') {
      return targetSet.has(midi) ? 'is-hit-correct' : 'is-hit-wrong';
    }

    return allowedImprovisationSet.has(midiToPitchClass(midi)) ? 'is-hit-correct' : 'is-hit-wrong';
  }

  function keyGuideStyle(midi: number): CSSProperties | undefined {
    if (mode !== 'improvisation') {
      return undefined;
    }

    const pitchClass = midiToPitchClass(midi);
    const style: CSSProperties = {};

    if (nextGuideMidiSet.has(midi) && nextScaleSet.has(pitchClass)) {
      (style as Record<string, string>)['--next-scale-color'] = withAlpha(
        intervalColorForTonicAndRoot(tonic, pitchClass, highlightColor),
        0.76,
      );
    }

    if (currentGuideMidiSet.has(midi) && currentScaleSet.has(pitchClass)) {
      (style as Record<string, string>)['--current-scale-color'] = withAlpha(
        intervalColorForTonicAndRoot(tonic, pitchClass, highlightColor),
        0.92,
      );
    }

    return Object.keys(style).length > 0 ? style : undefined;
  }

  return (
    <div className="qwerty-view">
      {mode === 'improvisation' ? (
        <div className="scale-guide qwerty-scale-guide" aria-hidden="true" style={{ width: stageWidth }}>
          <div className="scale-guide-row next">
            {nextGuideMarkers.map((marker) => {
              const key = keys.find((candidate) => candidate.midi === marker.midi);
              if (!key) {
                return null;
              }

              return (
                <span
                  key={`next:${marker.midi}`}
                  className="scale-guide-marker next"
                  style={{ left: `${key.centerX}px` }}
                >
                  <ScaleGuideLabel label={marker.label} />
                </span>
              );
            })}
          </div>
          <div className="scale-guide-row current">
            {currentGuideMarkers.map((marker) => {
              const key = keys.find((candidate) => candidate.midi === marker.midi);
              if (!key) {
                return null;
              }

              return (
                <span
                  key={`current:${marker.midi}`}
                  className="scale-guide-marker current"
                  style={{ left: `${key.centerX}px` }}
                >
                  <ScaleGuideLabel label={marker.label} />
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="qwerty-stage" style={{ width: stageWidth }}>
        <div className="piano-white-row">
          {whiteKeys.map((key) => {
            const active = activeNotes.has(key.midi);
            const pitchClass = midiToPitchClass(key.midi);
            const hasTarget = mode === 'guided'
              ? targetSet.has(key.midi)
              : labeledGuideMidiSet.has(key.midi) && chordToneSet.has(pitchClass);
            const guideStyle = keyGuideStyle(key.midi);
            const keyClasses = [
              'piano-key',
              'white',
              'qwerty-key',
              guideStyle && 'is-scale-guided',
              guideStyle && currentGuideMidiSet.has(key.midi) && 'is-scale-current',
              guideStyle && nextGuideMidiSet.has(key.midi) && 'is-scale-next',
              toneClass(active, key.midi),
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div
                key={key.midi}
                className={keyClasses}
                role="img"
                aria-label={`QWERTY key ${key.qwertyLabel} for ${key.noteName}`}
                style={{ width: `${WHITE_KEY_WIDTH}px`, ...guideStyle }}
              >
                {guideStyle && nextGuideMidiSet.has(key.midi) ? <span className="key-scale-band next" /> : null}
                {guideStyle && currentGuideMidiSet.has(key.midi) ? <span className="key-scale-band current" /> : null}
                {hasTarget ? (
                  <span
                    className="key-marker chord"
                    style={{ backgroundColor: highlightColor }}
                  />
                ) : null}
                <span className="qwerty-keycap">{key.qwertyLabel}</span>
                <span className="qwerty-note-label">{key.noteName}</span>
              </div>
            );
          })}
        </div>

        <div className="piano-black-row">
          {blackKeys.map((key) => {
            const active = activeNotes.has(key.midi);
            const pitchClass = midiToPitchClass(key.midi);
            const hasTarget = mode === 'guided'
              ? targetSet.has(key.midi)
              : labeledGuideMidiSet.has(key.midi) && chordToneSet.has(pitchClass);
            const guideStyle = keyGuideStyle(key.midi);
            const keyClasses = [
              'piano-key',
              'black',
              'qwerty-key',
              guideStyle && 'is-scale-guided',
              guideStyle && currentGuideMidiSet.has(key.midi) && 'is-scale-current',
              guideStyle && nextGuideMidiSet.has(key.midi) && 'is-scale-next',
              toneClass(active, key.midi),
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div
                key={key.midi}
                className={keyClasses}
                role="img"
                aria-label={`QWERTY key ${key.qwertyLabel} for ${key.noteName}`}
                style={{
                  left: `${key.left}px`,
                  width: `${BLACK_KEY_WIDTH}px`,
                  ...guideStyle,
                }}
              >
                {guideStyle && nextGuideMidiSet.has(key.midi) ? <span className="key-scale-band next" /> : null}
                {guideStyle && currentGuideMidiSet.has(key.midi) ? <span className="key-scale-band current" /> : null}
                {hasTarget ? (
                  <span
                    className="key-marker chord"
                    style={{ backgroundColor: highlightColor }}
                  />
                ) : null}
                <span className="qwerty-keycap">{key.qwertyLabel}</span>
                <span className="qwerty-note-label">{key.noteName}</span>
              </div>
            );
          })}
        </div>

        <div className="qwerty-corner-hint" aria-hidden="true">
          <span>Z down</span>
          <span>X up</span>
        </div>
      </div>
    </div>
  );
}
