import { useMemo } from 'react';
import { Midi } from 'tonal';
import type { ExerciseMode } from '../types/music';
import {
  noteNumberForBinding,
  qwertyAnchorLabel,
  QWERTY_NOTE_BINDINGS,
} from '../lib/input/qwertyInput';
import { midiToPitchClass } from '../lib/theory/noteUtils';

interface QwertyViewProps {
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
}

interface GuideMarker {
  midi: number;
  label: string;
}

const WHITE_KEY_WIDTH = 42;
const BLACK_KEY_WIDTH = 28;

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
  const keys = useMemo(() => {
    return QWERTY_NOTE_BINDINGS.reduce<RenderKey[]>((result, binding) => {
      const whiteIndex = result.filter((key) => !key.isBlack).length;
      const midi = noteNumberForBinding(binding, octaveShift);
      if (binding.isBlack) {
        const left = (whiteIndex * WHITE_KEY_WIDTH) - (BLACK_KEY_WIDTH / 2);
        result.push({
          midi,
          qwertyLabel: binding.label,
          noteName: Midi.midiToNoteName(midi, { sharps: true }) ?? `M${midi}`,
          centerX: left + (BLACK_KEY_WIDTH / 2),
          isBlack: true,
          left,
        });
        return result;
      }

      const centerX = (whiteIndex * WHITE_KEY_WIDTH) + (WHITE_KEY_WIDTH / 2);
      result.push({
        midi,
        qwertyLabel: binding.label,
        noteName: Midi.midiToNoteName(midi, { sharps: true }) ?? `M${midi}`,
        centerX,
        isBlack: false,
        left: centerX - (WHITE_KEY_WIDTH / 2),
      });
      return result;
    }, []);
  }, [octaveShift]);

  const whiteKeys = keys.filter((key) => !key.isBlack);
  const blackKeys = keys.filter((key) => key.isBlack);
  const targetSet = new Set(targetNotes);
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

  return (
    <div className="qwerty-view">
      <div className="qwerty-heading">
        <strong>QWERTY</strong>
        <span>{qwertyAnchorLabel(octaveShift)}</span>
        <span>Z/X shift octave</span>
      </div>

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
            const hasTarget = targetSet.has(key.midi);

            return (
              <div
                key={key.midi}
                className={`piano-key white qwerty-key ${toneClass(active, key.midi)}`.trim()}
                role="img"
                aria-label={`QWERTY key ${key.qwertyLabel} for ${key.noteName}`}
                style={{ width: `${WHITE_KEY_WIDTH}px` }}
              >
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
            const hasTarget = targetSet.has(key.midi);

            return (
              <div
                key={key.midi}
                className={`piano-key black qwerty-key ${toneClass(active, key.midi)}`.trim()}
                role="img"
                aria-label={`QWERTY key ${key.qwertyLabel} for ${key.noteName}`}
                style={{
                  left: `${key.left}px`,
                  width: `${BLACK_KEY_WIDTH}px`,
                }}
              >
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
      </div>
    </div>
  );
}
