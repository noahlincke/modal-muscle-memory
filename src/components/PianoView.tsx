import { useEffect, useMemo, useRef } from 'react';
import { Midi } from 'tonal';
import type { ExerciseMode } from '../types/music';
import { midiToPitchClass } from '../lib/theory/noteUtils';

interface PianoViewProps {
  mode: ExerciseMode;
  minMidi: number;
  maxMidi: number;
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
  noteName: string;
  centerX: number;
}

interface RenderBlackKey extends RenderKey {
  left: number;
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

  return (
    <span className="scale-guide-label">
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

export function PianoView({
  mode,
  minMidi,
  maxMidi,
  targetNotes,
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
  const allowedImprovisationSet = new Set([
    ...chordTonePitchClasses,
    ...currentScalePitchClasses,
    ...nextScalePitchClasses,
  ]);

  const whiteKeys: RenderKey[] = useMemo(() => notes
    .filter((midi) => !isBlackKey(midi))
    .map((midi, index) => ({
      midi,
      noteName: Midi.midiToNoteName(midi, { sharps: true }) ?? `M${midi}`,
      centerX: (index * WHITE_KEY_WIDTH) + (WHITE_KEY_WIDTH / 2),
    })), [notes]);

  const blackKeys: RenderBlackKey[] = useMemo(() => notes
    .filter((midi) => isBlackKey(midi))
    .map((midi) => {
      const previousWhiteIndex = whiteKeys.reduce((index, key, candidateIndex) => {
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
        centerX: left + (BLACK_KEY_WIDTH / 2),
      };
    })
    .filter((key) => key.left > 0 && key.left < (whiteKeys.length * WHITE_KEY_WIDTH)), [notes, whiteKeys]);

  const guideKeys = useMemo(() => [...whiteKeys, ...blackKeys].sort((a, b) => a.midi - b.midi), [whiteKeys, blackKeys]);

  function markerKindForMidi(midi: number): MarkerKind {
    if (mode === 'guided') {
      return targetSet.has(midi) ? 'chord' : null;
    }

    return targetSet.has(midi) ? 'chord' : null;
  }

  function toneClass(active: boolean, midi: number): string {
    if (!active) return '';
    if (mode === 'guided') {
      return targetSet.has(midi) ? 'is-hit-correct' : 'is-hit-wrong';
    }
    return allowedImprovisationSet.has(midiToPitchClass(midi)) ? 'is-hit-correct' : 'is-hit-wrong';
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
                {guideKeys.map((key) => {
                  const label = nextScaleGuideLabels[midiToPitchClass(key.midi)];
                  if (!label) {
                    return null;
                  }

                  return (
                    <span
                      key={`next:${key.midi}`}
                      className="scale-guide-marker next"
                      style={{ left: `${key.centerX}px` }}
                    >
                      <ScaleGuideLabel label={label} />
                    </span>
                  );
                })}
              </div>
              <div className="scale-guide-row current">
                {guideKeys.map((key) => {
                  const label = currentScaleGuideLabels[midiToPitchClass(key.midi)];
                  if (!label) {
                    return null;
                  }

                  return (
                    <span
                      key={`current:${key.midi}`}
                      className="scale-guide-marker current"
                      style={{ left: `${key.centerX}px` }}
                    >
                      <ScaleGuideLabel label={label} />
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

                return (
                  <div
                    key={key.midi}
                    className={`piano-key white ${toneClass(active, key.midi)}`.trim()}
                    role="img"
                    aria-label={`Piano key ${key.noteName}`}
                    style={{ width: `${WHITE_KEY_WIDTH}px` }}
                  >
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

                return (
                  <div
                    key={key.midi}
                    className={`piano-key black ${toneClass(active, key.midi)}`.trim()}
                    role="img"
                    aria-label={`Piano key ${key.noteName}`}
                    style={{
                      left: `${key.left}px`,
                      width: `${BLACK_KEY_WIDTH}px`,
                    }}
                  >
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
