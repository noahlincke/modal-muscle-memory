import { type CSSProperties, useEffect, useMemo, useRef } from 'react';
import { Midi } from 'tonal';
import { intervalColorForTonicAndRoot } from '../lib/theory/intervalRing';
import type { ExerciseMode } from '../types/music';
import { midiToPitchClass } from '../lib/theory/noteUtils';

interface PianoViewProps {
  tonic: string | null;
  mode: ExerciseMode;
  clef: 'treble' | 'bass';
  minMidi: number;
  maxMidi: number;
  targetNotes: number[];
  flashcardAcceptedPitchClasses?: string[];
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
  noteName: string;
  left: number;
  right: number;
  centerX: number;
}

interface RenderBlackKey extends RenderKey {
  right: number;
}

interface GuideMarker {
  midi: number;
  label: string;
}

type MarkerKind = 'chord' | null;

const WHITE_KEY_WIDTH = 26;
const BLACK_KEY_WIDTH = 16;

function isBlackKey(midi: number): boolean {
  const pc = midi % 12;
  return [1, 3, 6, 8, 10].includes(pc);
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

function findNearestMidiAtOrAbove(targetMidi: number, pitchClass: string, minMidi: number, maxMidi: number): number | null {
  for (let midi = Math.max(minMidi, targetMidi); midi <= maxMidi; midi += 1) {
    if (midiToPitchClass(midi) === pitchClass) {
      return midi;
    }
  }
  return null;
}

function findNearestMidiAtOrBelow(targetMidi: number, pitchClass: string, minMidi: number, maxMidi: number): number | null {
  for (let midi = Math.min(maxMidi, targetMidi); midi >= minMidi; midi -= 1) {
    if (midiToPitchClass(midi) === pitchClass) {
      return midi;
    }
  }
  return null;
}

function findNearestMidiClosest(targetMidi: number, pitchClass: string, minMidi: number, maxMidi: number): number | null {
  const below = findNearestMidiAtOrBelow(targetMidi, pitchClass, minMidi, maxMidi);
  const above = findNearestMidiAtOrAbove(targetMidi, pitchClass, minMidi, maxMidi);

  if (below === null) {
    return above;
  }

  if (above === null) {
    return below;
  }

  return Math.abs(targetMidi - below) <= Math.abs(above - targetMidi) ? below : above;
}

function buildGuideMarkers(
  guideLabels: Record<string, string>,
  clef: 'treble' | 'bass',
  minMidi: number,
  maxMidi: number,
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
  const startMidi = findNearestMidiClosest(anchorSearchStart, anchorPitchClass, minMidi, maxMidi)
    ?? (clef === 'bass'
      ? findNearestMidiAtOrAbove(minMidi, anchorPitchClass, minMidi, maxMidi)
      : findNearestMidiAtOrBelow(maxMidi, anchorPitchClass, minMidi, maxMidi));

  if (startMidi === null) {
    return [];
  }

  const markers: GuideMarker[] = [{ midi: startMidi, label: entries[0][1] }];
  let previousMidi = startMidi;

  for (let index = 1; index < entries.length; index += 1) {
    const [pitchClass, label] = entries[index];
    const nextMidi = findNearestMidiAtOrAbove(previousMidi + 1, pitchClass, minMidi, maxMidi);
    if (nextMidi === null) {
      break;
    }

    markers.push({ midi: nextMidi, label });
    previousMidi = nextMidi;
  }

  return markers;
}

export function PianoView({
  tonic,
  mode,
  clef,
  minMidi,
  maxMidi,
  targetNotes,
  flashcardAcceptedPitchClasses = [],
  chordTonePitchClasses,
  currentScalePitchClasses,
  currentScaleGuideLabels,
  nextScalePitchClasses,
  nextScaleGuideLabels,
  activeNotes,
  highlightColor,
}: PianoViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const notes = useMemo(() => {
    const value: number[] = [];
    for (let midi = minMidi; midi <= maxMidi; midi += 1) {
      value.push(midi);
    }
    return value;
  }, [minMidi, maxMidi]);

  const targetSet = new Set([...targetNotes].slice(0, 4).sort((a, b) => a - b));
  const flashcardAcceptedSet = useMemo(() => new Set(flashcardAcceptedPitchClasses), [flashcardAcceptedPitchClasses]);
  const currentScaleSet = useMemo(() => new Set(currentScalePitchClasses), [currentScalePitchClasses]);
  const nextScaleSet = useMemo(() => new Set(nextScalePitchClasses), [nextScalePitchClasses]);
  const allowedImprovisationSet = new Set([
    ...chordTonePitchClasses,
    ...currentScalePitchClasses,
    ...nextScalePitchClasses,
  ]);

  const whiteKeysBase: RenderKey[] = useMemo(() => notes
    .filter((midi) => !isBlackKey(midi))
    .map((midi, index) => ({
      midi,
      noteName: Midi.midiToNoteName(midi, { sharps: true }) ?? `M${midi}`,
      left: index * WHITE_KEY_WIDTH,
      right: (index + 1) * WHITE_KEY_WIDTH,
      centerX: (index * WHITE_KEY_WIDTH) + (WHITE_KEY_WIDTH / 2),
    })), [notes]);

  const blackKeys: RenderBlackKey[] = useMemo(() => notes
    .filter((midi) => isBlackKey(midi))
    .map((midi) => {
      const previousWhiteIndex = whiteKeysBase.reduce((index, key, candidateIndex) => {
        if (key.midi < midi) {
          return candidateIndex;
        }
        return index;
      }, -1);

      const left = previousWhiteIndex < 0
        ? 0
        : ((previousWhiteIndex + 1) * WHITE_KEY_WIDTH) - (BLACK_KEY_WIDTH / 2);

      return {
        midi,
        noteName: Midi.midiToNoteName(midi, { sharps: true }) ?? `M${midi}`,
        left,
        right: left + BLACK_KEY_WIDTH,
        centerX: left + (BLACK_KEY_WIDTH / 2),
      };
    })
    .filter((key) => key.left > 0 && key.left < (whiteKeysBase.length * WHITE_KEY_WIDTH)), [notes, whiteKeysBase]);

  const whiteKeys: RenderKey[] = useMemo(() => whiteKeysBase.map((key) => {
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

  const guideKeys = useMemo(() => [...whiteKeys, ...blackKeys].sort((a, b) => a.midi - b.midi), [whiteKeys, blackKeys]);

  const nextGuideMarkers = useMemo(
    () => buildGuideMarkers(nextScaleGuideLabels, clef, minMidi, maxMidi, targetNotes),
    [clef, maxMidi, minMidi, nextScaleGuideLabels, targetNotes],
  );
  const currentGuideMarkers = useMemo(
    () => buildGuideMarkers(currentScaleGuideLabels, clef, minMidi, maxMidi, targetNotes),
    [clef, currentScaleGuideLabels, maxMidi, minMidi, targetNotes],
  );
  const currentGuideMidiSet = useMemo(
    () => new Set(currentGuideMarkers.map((marker) => marker.midi)),
    [currentGuideMarkers],
  );
  const nextGuideMidiSet = useMemo(
    () => new Set(nextGuideMarkers.map((marker) => marker.midi)),
    [nextGuideMarkers],
  );
  function markerKindForMidi(midi: number): MarkerKind {
    return targetSet.has(midi) ? 'chord' : null;
  }

  function toneClass(active: boolean, midi: number): string {
    if (!active) return '';
    if (mode === 'guided') {
      return targetSet.has(midi) ? 'is-hit-correct' : 'is-hit-wrong';
    }
    if (mode === 'chord_flashcards') {
      return flashcardAcceptedSet.has(midiToPitchClass(midi)) ? 'is-hit-correct' : 'is-hit-wrong';
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

  useEffect(() => {
    if (mode !== 'improvisation' || !scrollRef.current) {
      return;
    }

    const centerIndex = whiteKeys.findIndex((key) => key.midi === 60);
    if (centerIndex < 0) {
      return;
    }

    const centerX = whiteKeys[centerIndex].centerX;
    const viewportWidth = scrollRef.current.clientWidth;
    scrollRef.current.scrollLeft = Math.max(0, centerX - (viewportWidth / 2));
  }, [mode, whiteKeys]);

  const stageWidth = `${whiteKeys.length * WHITE_KEY_WIDTH}px`;

  return (
    <div className="piano-view">
      <div className="piano-scroll" ref={scrollRef}>
        <div className="piano-scroll-content" style={{ width: stageWidth }}>
          {mode === 'improvisation' ? (
            <div className="scale-guide" aria-hidden="true">
              <div className="scale-guide-row next">
                {nextGuideMarkers.map((marker) => {
                  const key = guideKeys.find((candidate) => candidate.midi === marker.midi);
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
                  const key = guideKeys.find((candidate) => candidate.midi === marker.midi);
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

          <div className="piano-stage" style={{ width: stageWidth }}>
            <div className="piano-white-row">
              {whiteKeys.map((key) => {
                const active = activeNotes.has(key.midi);
                const markerKind = markerKindForMidi(key.midi);
                const guideStyle = keyGuideStyle(key.midi);
                const keyClasses = [
                  'piano-key',
                  'white',
                  guideStyle && 'is-scale-guided',
                  guideStyle && currentScaleSet.has(midiToPitchClass(key.midi)) && 'is-scale-current',
                  guideStyle && nextScaleSet.has(midiToPitchClass(key.midi)) && 'is-scale-next',
                  toneClass(active, key.midi),
                ]
                  .filter(Boolean)
                  .join(' ');
                const style: CSSProperties = { width: `${WHITE_KEY_WIDTH}px`, ...guideStyle };

                return (
                  <div
                    key={key.midi}
                    className={keyClasses}
                    role="img"
                    aria-label={`Piano key ${key.noteName}`}
                    style={style}
                  >
                    {guideStyle && nextScaleSet.has(midiToPitchClass(key.midi)) ? <span className="key-scale-band next" /> : null}
                    {guideStyle && currentScaleSet.has(midiToPitchClass(key.midi)) ? <span className="key-scale-band current" /> : null}
                    {markerKind ? (
                      <span
                        className={`key-marker ${markerKind}`.trim()}
                        style={markerKind === 'chord' ? { backgroundColor: highlightColor } : undefined}
                      />
                    ) : null}
                    {/^(C)\d$/.test(key.noteName) ? <span className="key-label">{key.noteName}</span> : null}
                  </div>
                );
              })}
            </div>

            <div className="piano-black-row">
              {blackKeys.map((key) => {
                const active = activeNotes.has(key.midi);
                const markerKind = markerKindForMidi(key.midi);
                const guideStyle = keyGuideStyle(key.midi);
                const keyClasses = [
                  'piano-key',
                  'black',
                  guideStyle && 'is-scale-guided',
                  guideStyle && currentScaleSet.has(midiToPitchClass(key.midi)) && 'is-scale-current',
                  guideStyle && nextScaleSet.has(midiToPitchClass(key.midi)) && 'is-scale-next',
                  toneClass(active, key.midi),
                ]
                  .filter(Boolean)
                  .join(' ');
                const style: CSSProperties = {
                  left: `${key.left}px`,
                  width: `${BLACK_KEY_WIDTH}px`,
                  ...guideStyle,
                };

                return (
                  <div
                    key={key.midi}
                    className={keyClasses}
                    role="img"
                    aria-label={`Piano key ${key.noteName}`}
                    style={style}
                  >
                    {guideStyle && nextScaleSet.has(midiToPitchClass(key.midi)) ? <span className="key-scale-band next" /> : null}
                    {guideStyle && currentScaleSet.has(midiToPitchClass(key.midi)) ? <span className="key-scale-band current" /> : null}
                    {markerKind ? (
                      <span
                        className={`key-marker ${markerKind}`.trim()}
                        style={markerKind === 'chord' ? { backgroundColor: highlightColor } : undefined}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
