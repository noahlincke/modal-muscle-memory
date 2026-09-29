import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Midi } from 'tonal';
import { intervalColorForTonicAndRoot } from '../lib/theory/intervalRing';
import type { ExerciseMode, ScalePrompt } from '../types/music';
import { midiToPitchClass } from '../lib/theory/noteUtils';
import { computeVisibleRange, isWhiteKey, TOTAL_WHITE_KEY_COUNT } from '../lib/keyboard/range';

interface PianoViewProps {
  tonic: string | null;
  mode: ExerciseMode;
  clef: 'treble' | 'bass';
  minMidi: number;
  maxMidi: number;
  targetNotes: number[];
  scalePrompt?: ScalePrompt | null;
  completedScaleNoteIndices?: Set<number>;
  flashcardAcceptedPitchClasses?: string[];
  chordTonePitchClasses: string[];
  currentScalePitchClasses: string[];
  currentScaleGuideLabels: Record<string, string>;
  nextScalePitchClasses: string[];
  nextScaleGuideLabels: Record<string, string>;
  activeNotes: Set<number>;
  highlightColor: string;
  onNoteOn?: (midi: number, velocity: number) => void;
  onNoteOff?: (midi: number) => void;
  minWhiteKeyWidth?: number;
  centerMidi?: number;
}

interface RenderKey {
  midi: number;
  noteName: string;
  left: number;
  right: number;
  centerX: number;
}

interface GuideMarker {
  midi: number;
  label: string;
}

type MarkerKind = 'chord' | null;

interface ScaleMarkerState {
  backgroundColor: string;
}

const BLACK_KEY_WIDTH_RATIO = 16 / 26;
const DEFAULT_CENTER_MIDI = 60;
const FINE_MIN_WHITE_KEY_WIDTH = 22;
const COARSE_MIN_WHITE_KEY_WIDTH = 44;
const MOUSE_VELOCITY = 0.75;
const COMPLETED_SCALE_MARKER_COLOR = 'var(--ink-soft)';

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

function velocityForPointer(pointerType: string, clientY: number, keyElement: Element): number {
  if (pointerType === 'mouse') {
    return MOUSE_VELOCITY;
  }

  const rect = keyElement.getBoundingClientRect();
  const raw = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  const ratio = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
  return 0.55 + ratio * 0.35;
}

export function PianoView({
  tonic,
  mode,
  clef,
  minMidi,
  maxMidi,
  targetNotes,
  scalePrompt = null,
  completedScaleNoteIndices = new Set<number>(),
  flashcardAcceptedPitchClasses = [],
  chordTonePitchClasses,
  currentScalePitchClasses,
  currentScaleGuideLabels,
  nextScalePitchClasses,
  nextScaleGuideLabels,
  activeNotes,
  highlightColor,
  onNoteOn,
  onNoteOff,
  minWhiteKeyWidth,
  centerMidi,
}: PianoViewProps) {
  const playable = onNoteOn !== undefined && onNoteOff !== undefined;
  const viewRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(() => (
    typeof window === 'undefined' ? 0 : window.innerWidth
  ));
  const [octaveShift, setOctaveShift] = useState(0);
  const [pressedMidis, setPressedMidis] = useState<Set<number>>(() => new Set());

  const pointersRef = useRef(new Map<number, number | null>());
  const noteCountsRef = useRef(new Map<number, number>());
  const onNoteOnRef = useRef(onNoteOn);
  const onNoteOffRef = useRef(onNoteOff);
  onNoteOnRef.current = onNoteOn;
  onNoteOffRef.current = onNoteOff;

  const coarsePointer = useMemo(() => (
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  ), []);
  const effectiveMinWhiteKeyWidth = minWhiteKeyWidth
    ?? (coarsePointer ? COARSE_MIN_WHITE_KEY_WIDTH : FINE_MIN_WHITE_KEY_WIDTH);
  const effectiveCenterMidi = centerMidi ?? DEFAULT_CENTER_MIDI;

  const pressMidi = useCallback((midi: number, velocity: number) => {
    const count = noteCountsRef.current.get(midi) ?? 0;
    noteCountsRef.current.set(midi, count + 1);
    if (count === 0) {
      onNoteOnRef.current?.(midi, velocity);
      setPressedMidis((previous) => new Set(previous).add(midi));
    }
  }, []);

  const releaseMidi = useCallback((midi: number) => {
    const count = (noteCountsRef.current.get(midi) ?? 0) - 1;
    if (count > 0) {
      noteCountsRef.current.set(midi, count);
      return;
    }

    noteCountsRef.current.delete(midi);
    onNoteOffRef.current?.(midi);
    setPressedMidis((previous) => {
      if (!previous.has(midi)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(midi);
      return next;
    });
  }, []);

  const releasePointer = useCallback((pointerId: number) => {
    const midi = pointersRef.current.get(pointerId);
    if (midi === undefined) {
      return;
    }
    pointersRef.current.delete(pointerId);
    if (midi !== null) {
      releaseMidi(midi);
    }
  }, [releaseMidi]);

  const releaseAllPointers = useCallback(() => {
    for (const pointerId of [...pointersRef.current.keys()]) {
      releasePointer(pointerId);
    }
  }, [releasePointer]);

  useLayoutEffect(() => {
    const element = viewRef.current;
    if (!element) {
      return undefined;
    }

    const update = () => {
      // clientWidth 0 (hidden element, jsdom) carries no measurement; keep the
      // current estimate instead of collapsing to the full range.
      const width = element.clientWidth;
      if (width <= 0) {
        return;
      }
      setContainerWidth((previous) => {
        // A width change rebuilds the key elements, which would strand any
        // pointer captured to a removed key, so release held notes first.
        if (previous !== width) {
          releaseAllPointers();
        }
        return width;
      });
    };

    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [releaseAllPointers]);

  useEffect(() => {
    if (!playable) {
      return undefined;
    }

    const handleBlur = () => releaseAllPointers();
    const handleVisibilityChange = () => {
      if (document.hidden) {
        releaseAllPointers();
      }
    };
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseAllPointers();
    };
  }, [playable, releaseAllPointers]);

  const [lowMidi, highMidi] = useMemo(() => computeVisibleRange({
    containerWidth,
    minWhiteKeyWidth: effectiveMinWhiteKeyWidth,
    centerMidi: effectiveCenterMidi,
    octaveShift,
  }), [containerWidth, effectiveMinWhiteKeyWidth, effectiveCenterMidi, octaveShift]);

  const visibleMidis = useMemo(() => {
    const value: number[] = [];
    for (let midi = lowMidi; midi <= highMidi; midi += 1) {
      value.push(midi);
    }
    return value;
  }, [lowMidi, highMidi]);

  const whiteCount = useMemo(
    () => visibleMidis.filter((midi) => isWhiteKey(midi)).length,
    [visibleMidis],
  );
  const whiteWidthPct = 100 / whiteCount;

  const whiteKeysBase: RenderKey[] = useMemo(() => visibleMidis
    .filter((midi) => isWhiteKey(midi))
    .map((midi, index) => ({
      midi,
      noteName: Midi.midiToNoteName(midi, { sharps: true }) ?? `M${midi}`,
      left: index * whiteWidthPct,
      right: (index + 1) * whiteWidthPct,
      centerX: (index * whiteWidthPct) + (whiteWidthPct / 2),
    })), [visibleMidis, whiteWidthPct]);

  const blackKeys: RenderKey[] = useMemo(() => visibleMidis
    .filter((midi) => !isWhiteKey(midi))
    .map((midi) => {
      const whitesBelow = visibleMidis.reduce((count, candidate) => {
        if (isWhiteKey(candidate) && candidate < midi) {
          return count + 1;
        }
        return count;
      }, 0);
      const blackWidthPct = whiteWidthPct * BLACK_KEY_WIDTH_RATIO;

      const left = whitesBelow > 0
        ? (whitesBelow * whiteWidthPct) - (blackWidthPct / 2)
        : -(blackWidthPct / 2);

      return {
        midi,
        noteName: Midi.midiToNoteName(midi, { sharps: true }) ?? `M${midi}`,
        left,
        right: left + blackWidthPct,
        centerX: left + (blackWidthPct / 2),
      };
    })
    .filter((key) => key.left > 0 && key.left < 100), [visibleMidis, whiteWidthPct]);

  const whiteKeys: RenderKey[] = useMemo(() => whiteKeysBase.map((key) => {
    const midpoint = (key.left + key.right) / 2;
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

  const scaleMarkerStates = useMemo(() => {
    if (mode !== 'scale' || !scalePrompt) {
      return new Map<number, ScaleMarkerState>();
    }

    const markers = new Map<number, ScaleMarkerState>();

    scalePrompt.noteSequence.forEach((note, noteIndex) => {
      const isCompleted = completedScaleNoteIndices.has(noteIndex);
      const backgroundColor = isCompleted
        ? COMPLETED_SCALE_MARKER_COLOR
        : intervalColorForTonicAndRoot(scalePrompt.tonic, midiToPitchClass(note.midi), highlightColor);
      const previous = markers.get(note.midi);

      if (!previous || previous.backgroundColor === COMPLETED_SCALE_MARKER_COLOR) {
        markers.set(note.midi, { backgroundColor });
      }
    });

    return markers;
  }, [completedScaleNoteIndices, highlightColor, mode, scalePrompt]);

  const targetSet = new Set([...targetNotes].slice(0, 4).sort((a, b) => a - b));
  const flashcardAcceptedSet = useMemo(() => new Set(flashcardAcceptedPitchClasses), [flashcardAcceptedPitchClasses]);
  const currentScaleSet = useMemo(() => new Set(currentScalePitchClasses), [currentScalePitchClasses]);
  const nextScaleSet = useMemo(() => new Set(nextScalePitchClasses), [nextScalePitchClasses]);
  const allowedImprovisationSet = new Set([
    ...chordTonePitchClasses,
    ...currentScalePitchClasses,
    ...nextScalePitchClasses,
  ]);

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

  const showOctaveControls = whiteCount < TOTAL_WHITE_KEY_COUNT;
  const canLower = useMemo(() => computeVisibleRange({
    containerWidth,
    minWhiteKeyWidth: effectiveMinWhiteKeyWidth,
    centerMidi: effectiveCenterMidi,
    octaveShift: octaveShift - 1,
  })[0] < lowMidi, [containerWidth, effectiveCenterMidi, effectiveMinWhiteKeyWidth, lowMidi, octaveShift]);
  const canHigher = useMemo(() => computeVisibleRange({
    containerWidth,
    minWhiteKeyWidth: effectiveMinWhiteKeyWidth,
    centerMidi: effectiveCenterMidi,
    octaveShift: octaveShift + 1,
  })[1] > highMidi, [containerWidth, effectiveCenterMidi, effectiveMinWhiteKeyWidth, highMidi, octaveShift]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const keyElement = (event.target as Element).closest<HTMLElement>('[data-midi]');
    if (!keyElement) {
      return;
    }

    event.preventDefault();
    if (event.pointerType === 'mouse') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer may already be gone; note tracking still works via map.
      }
    }

    const midi = Number(keyElement.dataset.midi);
    pointersRef.current.set(event.pointerId, midi);
    pressMidi(midi, velocityForPointer(event.pointerType, event.clientY, keyElement));
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    const hitElement = document.elementFromPoint(event.clientX, event.clientY);
    const keyElement = hitElement?.closest<HTMLElement>('[data-midi]') ?? null;
    const midi = keyElement ? Number(keyElement.dataset.midi) : null;
    if (pointersRef.current.get(event.pointerId) === midi) {
      return;
    }

    const previousMidi = pointersRef.current.get(event.pointerId) ?? null;
    if (previousMidi !== null) {
      releaseMidi(previousMidi);
    }
    pointersRef.current.set(event.pointerId, midi);
    if (midi !== null && keyElement) {
      pressMidi(midi, velocityForPointer(event.pointerType, event.clientY, keyElement));
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    releasePointer(event.pointerId);
  }

  return (
    <div className="piano-view" ref={viewRef}>
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
                  style={{ left: `${key.centerX}%` }}
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
                  style={{ left: `${key.centerX}%` }}
                >
                  <ScaleGuideLabel label={marker.label} />
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        className={`piano-stage${playable ? ' is-playable' : ''}`.trim()}
        onPointerDown={playable ? handlePointerDown : undefined}
        onPointerMove={playable ? handlePointerMove : undefined}
        onPointerUp={playable ? handlePointerEnd : undefined}
        onPointerCancel={playable ? handlePointerEnd : undefined}
        onLostPointerCapture={playable ? handlePointerEnd : undefined}
        onContextMenu={playable ? (event) => event.preventDefault() : undefined}
        onClick={playable ? (event) => event.stopPropagation() : undefined}
      >
        <div className="piano-white-row">
          {whiteKeys.map((key) => {
            const active = activeNotes.has(key.midi);
            const markerKind = markerKindForMidi(key.midi);
            const scaleMarker = scaleMarkerStates.get(key.midi);
            const guideStyle = keyGuideStyle(key.midi);
            const keyClasses = [
              'piano-key',
              'white',
              pressedMidis.has(key.midi) && 'is-pressed',
              guideStyle && 'is-scale-guided',
              guideStyle && currentScaleSet.has(midiToPitchClass(key.midi)) && 'is-scale-current',
              guideStyle && nextScaleSet.has(midiToPitchClass(key.midi)) && 'is-scale-next',
              toneClass(active, key.midi),
            ]
              .filter(Boolean)
              .join(' ');
            const style: CSSProperties = { width: `${whiteWidthPct}%`, ...guideStyle };

            return (
              <div
                key={key.midi}
                className={keyClasses}
                role="img"
                aria-label={`Piano key ${key.noteName}`}
                style={style}
                data-midi={key.midi}
              >
                {guideStyle && nextScaleSet.has(midiToPitchClass(key.midi)) ? <span className="key-scale-band next" /> : null}
                {guideStyle && currentScaleSet.has(midiToPitchClass(key.midi)) ? <span className="key-scale-band current" /> : null}
                {markerKind ? (
                  <span
                    className={`key-marker ${markerKind}`.trim()}
                    style={markerKind === 'chord' ? { backgroundColor: highlightColor } : undefined}
                  />
                ) : null}
                {!markerKind && scaleMarker ? (
                  <span className="key-marker" style={scaleMarker} />
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
            const scaleMarker = scaleMarkerStates.get(key.midi);
            const guideStyle = keyGuideStyle(key.midi);
            const keyClasses = [
              'piano-key',
              'black',
              pressedMidis.has(key.midi) && 'is-pressed',
              guideStyle && 'is-scale-guided',
              guideStyle && currentScaleSet.has(midiToPitchClass(key.midi)) && 'is-scale-current',
              guideStyle && nextScaleSet.has(midiToPitchClass(key.midi)) && 'is-scale-next',
              toneClass(active, key.midi),
            ]
              .filter(Boolean)
              .join(' ');
            const style: CSSProperties = {
              left: `${key.left}%`,
              width: `${(key.right - key.left)}%`,
              ...guideStyle,
            };

            return (
              <div
                key={key.midi}
                className={keyClasses}
                role="img"
                aria-label={`Piano key ${key.noteName}`}
                style={style}
                data-midi={key.midi}
              >
                {guideStyle && nextScaleSet.has(midiToPitchClass(key.midi)) ? <span className="key-scale-band next" /> : null}
                {guideStyle && currentScaleSet.has(midiToPitchClass(key.midi)) ? <span className="key-scale-band current" /> : null}
                {markerKind ? (
                  <span
                    className={`key-marker ${markerKind}`.trim()}
                    style={markerKind === 'chord' ? { backgroundColor: highlightColor } : undefined}
                  />
                ) : null}
                {!markerKind && scaleMarker ? (
                  <span className="key-marker" style={scaleMarker} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {showOctaveControls ? (
        <>
          <button
            type="button"
            className="piano-octave-button lower"
            aria-label="Lower octave"
            disabled={!canLower}
            onClick={(event) => {
              event.stopPropagation();
              setOctaveShift((shift) => shift - 1);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="piano-octave-button higher"
            aria-label="Higher octave"
            disabled={!canHigher}
            onClick={(event) => {
              event.stopPropagation();
              setOctaveShift((shift) => shift + 1);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      ) : null}
    </div>
  );
}
