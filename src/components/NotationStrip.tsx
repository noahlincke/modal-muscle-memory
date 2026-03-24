import { useEffect, useMemo, useRef } from 'react';
import { Accidental, Dot, Formatter, Renderer, Stave, StaveNote, StaveTie, Voice } from 'vexflow';
import { getScaleOption } from '../content/scales';
import { intervalColorForTonicAndRoot } from '../lib/theory/intervalRing';
import { octaveForSpellingAtMidi } from '../lib/theory/noteUtils';
import { resolveRomanToChord } from '../lib/theory/roman';
import type { ExerciseMode, Phrase } from '../types/music';

interface NotationStripProps {
  phrase: Phrase | null;
  hasCompatiblePhrases: boolean;
  currentEventIndex: number;
  completedEventIds: Set<string>;
  clef: 'treble' | 'bass';
  exerciseMode: ExerciseMode;
  theme: 'light' | 'dark' | 'focus';
}

function notationPalette(theme: NotationStripProps['theme']): {
  ink: string;
  completedInk: string;
} {
  if (theme === 'focus') {
    return {
      ink: '#dbe8f6',
      completedInk: 'rgba(159, 181, 206, 0.46)',
    };
  }

  if (theme === 'dark') {
    return {
      ink: '#253244',
      completedInk: 'rgba(60, 75, 96, 0.45)',
    };
  }

  return {
    ink: '#1f2830',
    completedInk: 'rgba(31, 40, 45, 0.35)',
  };
}

function durationFromBeats(durationBeats: number): string {
  if (durationBeats === 4) return 'w';
  if (durationBeats === 3) return 'hd';
  if (durationBeats === 2) return 'h';
  if (durationBeats === 1.5) return 'qd';
  if (durationBeats === 1) return 'q';
  return '8';
}

function durationFromBeatsRest(durationBeats: number): string {
  return `${durationFromBeats(durationBeats)}r`;
}

function dotCountForBeats(durationBeats: number): number {
  if (durationBeats === 3 || durationBeats === 1.5) {
    return 1;
  }

  return 0;
}

function durationsForNotation(durationBeats: number): number[] {
  if (durationBeats === 4 || durationBeats === 3 || durationBeats === 2 || durationBeats === 1.5 || durationBeats === 1 || durationBeats === 0.5) {
    return [durationBeats];
  }

  if (durationBeats === 2.5) {
    return [0.5, 2];
  }

  if (durationBeats === 3.5) {
    return [3, 0.5];
  }

  return [durationBeats];
}

function roundBeat(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function splitDurationAcrossBars(startAbsoluteBeat: number, durationBeats: number): Array<{
  bar: number;
  startBeatInBar: number;
  durationBeats: number;
}> {
  const segments: Array<{
    bar: number;
    startBeatInBar: number;
    durationBeats: number;
  }> = [];

  let cursor = startAbsoluteBeat;
  let remaining = durationBeats;

  while (remaining > 0.0001) {
    const bar = Math.floor(cursor / 4) + 1;
    const barStart = (bar - 1) * 4;
    const startBeatInBar = roundBeat(cursor - barStart);
    const availableInBar = 4 - startBeatInBar;
    const segmentDuration = roundBeat(Math.min(remaining, availableInBar));

    segments.push({
      bar,
      startBeatInBar,
      durationBeats: segmentDuration,
    });

    cursor = roundBeat(cursor + segmentDuration);
    remaining = roundBeat(remaining - segmentDuration);
  }

  return segments;
}

function restKeyForClef(clef: 'treble' | 'bass'): string {
  return clef === 'bass' ? 'd/3' : 'b/4';
}

function spelledMidiToVexKey(noteSpelling: string, midi: number): { key: string; accidental: string | null } {
  const match = noteSpelling.match(/^([A-G])([#b]*)$/);
  if (!match) {
    return { key: 'c/4', accidental: null };
  }

  const [, letter, accidental] = match;
  const octave = octaveForSpellingAtMidi(noteSpelling, midi);
  return {
    key: `${letter.toLowerCase()}/${octave}`,
    accidental: accidental || null,
  };
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

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function countAccidentals(noteSpelling: string): number {
  const accidentalMatch = noteSpelling.match(/[#b]+/g);
  if (!accidentalMatch) {
    return 0;
  }

  return accidentalMatch.join('').length;
}

interface ScaleDisplay {
  rootPitchClass: string;
  primaryLabel: string | null;
  alternateLabels: string[];
}

function scaleDisplayForStep(phrase: Phrase, stepIndex: number): ScaleDisplay | null {
  const step = phrase.progression.steps[stepIndex];
  if (!step) {
    return null;
  }

  const rootPitchClass = resolveRomanToChord(phrase.tonic, step.roman).rootPitchClass;
  const labels = unique([...step.recommendedScaleIds, ...step.colorScaleIds]).map((scaleId) => getScaleOption(scaleId).label);

  return {
    rootPitchClass,
    primaryLabel: labels[0] ?? null,
    alternateLabels: labels.slice(1),
  };
}

export function NotationStrip({
  phrase,
  hasCompatiblePhrases,
  currentEventIndex,
  completedEventIds,
  clef,
  exerciseMode,
  theme,
}: NotationStripProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentStepIndex = phrase?.events[currentEventIndex]?.progressionStepIndex ?? currentEventIndex;
  const currentScaleDisplay = useMemo(
    () => (phrase && exerciseMode === 'improvisation' ? scaleDisplayForStep(phrase, currentStepIndex) : null),
    [phrase, exerciseMode, currentStepIndex],
  );
  const nextScaleDisplay = useMemo(
    () => (phrase && exerciseMode === 'improvisation' ? scaleDisplayForStep(phrase, currentStepIndex + 1) : null),
    [phrase, exerciseMode, currentStepIndex],
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    containerRef.current.innerHTML = '';

    if (!phrase || phrase.events.length === 0) {
      return;
    }

    const barCount = Math.max(...phrase.events.map((event) => event.bar));
    const containerWidth = Math.max(containerRef.current.clientWidth, 960);
    const horizontalPadding = 52;
    const rightEdgePadding = 44;
    const bottomHudHeight = exerciseMode === 'improvisation' ? 48 : 0;
    const height = 306 + bottomHudHeight;
    const staveY = 96;
    const chordLabelY = 48;

    const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);
    const { ink: notationInk, completedInk: notationCompletedInk } = notationPalette(theme);

    type RenderedSegment = {
      event: Phrase['events'][number];
      token: Phrase['tokensById'][string];
      color: string;
      bar: number;
      startBeatInBar: number;
      durationBeats: number;
      showChordLabel: boolean;
    };

    const renderedSegments: RenderedSegment[] = [];

    phrase.events.forEach((event) => {
      const token = phrase.tokensById[event.chordTokenId];
      const eventIndex = phrase.events.findIndex((candidate) => candidate.id === event.id);
      const isCompleted = completedEventIds.has(event.id);
      const isCurrent = eventIndex === currentEventIndex;
      const intervalColor = intervalColorForTonicAndRoot(phrase.tonic, token.pitchClasses[0] ?? null);
      let eventColor = intervalColor;

      if (isCompleted) {
        eventColor = notationCompletedInk;
      } else if (!isCurrent) {
        eventColor = withAlpha(intervalColor, 0.62);
      }

      const startAbsoluteBeat = ((event.bar - 1) * 4) + (event.beat - 1);
      const barSegments = splitDurationAcrossBars(startAbsoluteBeat, event.durationBeats);

      barSegments.forEach((barSegment, barSegmentIndex) => {
        let subCursor = barSegment.startBeatInBar;
        durationsForNotation(barSegment.durationBeats).forEach((segmentDuration, segmentIndex) => {
          renderedSegments.push({
            event,
            token,
            color: eventColor,
            bar: barSegment.bar,
            startBeatInBar: subCursor,
            durationBeats: segmentDuration,
            showChordLabel: barSegmentIndex === 0 && segmentIndex === 0,
          });
          subCursor = roundBeat(subCursor + segmentDuration);
        });
      });
    });

    const barWidths = Array.from({ length: barCount }, (_, index) => {
      const bar = index + 1;
      const barEvents = phrase.events.filter((event) => event.bar === bar);
      const hitCount = barEvents.length;
      const accidentalCount = unique(barEvents.flatMap((event) => {
        const token = phrase.tokensById[event.chordTokenId];
        return token.spelledVoicing.slice(0, 4);
      })).reduce((count, spelling) => count + countAccidentals(spelling), 0);
      const baseWidth = bar === 1 ? 360 : 300;
      const hitWidth = Math.max(0, hitCount - 1) * 34;
      const accidentalWidth = accidentalCount * 12;
      return baseWidth + hitWidth + accidentalWidth;
    });

    const contentWidth = barWidths.reduce((sum, barWidth) => sum + barWidth, 0);
    const width = Math.max(containerWidth, contentWidth + horizontalPadding + rightEdgePadding);
    const contentStartX = Math.max(32, Math.floor((width - contentWidth - rightEdgePadding) / 2));

    renderer.resize(width, height);
    const context = renderer.getContext();
    const barStartXs = barWidths.reduce<number[]>((positions, _barWidth, index) => {
      if (index === 0) {
        positions.push(contentStartX);
      } else {
        positions.push(positions[index - 1] + barWidths[index - 1]);
      }
      return positions;
    }, []);

    const previousNoteByEventId = new Map<string, { staveNote: StaveNote; noteCount: number }>();

    for (let bar = 1; bar <= barCount; bar += 1) {
      const barWidth = barWidths[bar - 1];
      const x = barStartXs[bar - 1];
      const stave = new Stave(x, staveY, barWidth - 12);
      if (bar === 1) {
        stave.addClef(clef).addTimeSignature('4/4');
      }
      context.setFillStyle(notationInk);
      context.setStrokeStyle(notationInk);
      stave.setContext(context).draw();

      const renderedNotes: Array<{
        event: Phrase['events'][number] | null;
        token: Phrase['tokensById'][string] | null;
        staveNote: StaveNote;
        eventColor: string | null;
        showChordLabel: boolean;
      }> = [];
      const ties: StaveTie[] = [];

      const barSegments = renderedSegments
        .filter((segment) => segment.bar === bar)
        .sort((left, right) => left.startBeatInBar - right.startBeatInBar);

      let cursor = 0;

      barSegments.forEach((segment) => {
        const gap = roundBeat(segment.startBeatInBar - cursor);
        if (gap > 0.0001) {
          durationsForNotation(gap).forEach((restDuration) => {
            const staveNote = new StaveNote({
              clef,
              keys: [restKeyForClef(clef)],
              duration: durationFromBeatsRest(restDuration),
            });
            if (dotCountForBeats(restDuration) > 0) {
              Dot.buildAndAttach([staveNote], { all: true });
            }
            renderedNotes.push({
              event: null,
              token: null,
              staveNote,
              eventColor: null,
              showChordLabel: false,
            });
          });
        }

        const keys = segment.token.midiVoicing
          .slice(0, 4)
          .map((note, index) => ({
            midi: note,
            spelling: segment.token.spelledVoicing[index] ?? segment.token.pitchClasses[index] ?? 'C',
          }))
          .sort((a, b) => a.midi - b.midi)
          .map((entry) => spelledMidiToVexKey(entry.spelling, entry.midi));

        const staveNote = new StaveNote({
          clef,
          keys: keys.map((entry) => entry.key),
          duration: durationFromBeats(segment.durationBeats),
        });

        keys.forEach((entry, index) => {
          if (entry.accidental) {
            staveNote.addModifier(new Accidental(entry.accidental), index);
          }
        });
        if (dotCountForBeats(segment.durationBeats) > 0) {
          Dot.buildAndAttach([staveNote], { all: true });
        }

        staveNote.setStyle({ fillStyle: segment.color, strokeStyle: segment.color });

        renderedNotes.push({
          event: segment.event,
          token: segment.token,
          staveNote,
          eventColor: segment.color,
          showChordLabel: segment.showChordLabel,
        });

        const previousSegment = previousNoteByEventId.get(segment.event.id);
        if (previousSegment) {
          ties.push(new StaveTie({
            firstNote: previousSegment.staveNote,
            lastNote: staveNote,
            firstIndexes: Array.from({ length: previousSegment.noteCount }, (_, noteIndex) => noteIndex),
            lastIndexes: keys.map((_, noteIndex) => noteIndex),
          }));
        }
        previousNoteByEventId.set(segment.event.id, { staveNote, noteCount: keys.length });
        cursor = roundBeat(segment.startBeatInBar + segment.durationBeats);
      });

      const tailRest = roundBeat(4 - cursor);
      if (tailRest > 0.0001) {
        durationsForNotation(tailRest).forEach((restDuration) => {
          const staveNote = new StaveNote({
            clef,
            keys: [restKeyForClef(clef)],
            duration: durationFromBeatsRest(restDuration),
          });
          if (dotCountForBeats(restDuration) > 0) {
            Dot.buildAndAttach([staveNote], { all: true });
          }
          renderedNotes.push({
            event: null,
            token: null,
            staveNote,
            eventColor: null,
            showChordLabel: false,
          });
        });
      }

      const voice = new Voice({ numBeats: 4, beatValue: 4 });
      voice.addTickables(renderedNotes.map((entry) => entry.staveNote));
      new Formatter().joinVoices([voice]).format([voice], Math.max(210, barWidth - (bar === 1 ? 180 : 72)));
      context.setFillStyle(notationInk);
      context.setStrokeStyle(notationInk);
      voice.draw(context, stave);

      ties.forEach((tie) => tie.setContext(context).draw());

      renderedNotes.forEach((entry) => {
        if (!entry.showChordLabel || !entry.token || !entry.eventColor) {
          return;
        }
        const xPos = entry.staveNote.getAbsoluteX() - 16;
        context.setFont('18px "IBM Plex Sans", sans-serif');
        context.setFillStyle(entry.eventColor);
        context.fillText(entry.token.symbol, xPos, chordLabelY);
      });
    }
  }, [phrase, currentEventIndex, completedEventIds, clef, exerciseMode, theme]);

  if (!phrase) {
    return (
      <div className="notation-strip empty">
        {hasCompatiblePhrases ? 'Phrase loading…' : 'No compatible phrases for the current settings.'}
      </div>
    );
  }

  return (
    <div className={`notation-strip ${exerciseMode === 'improvisation' ? `improvisation ${clef}` : ''}`.trim()}>
      {exerciseMode === 'improvisation' && currentScaleDisplay ? (
        <div className="notation-scale-hud">
          {nextScaleDisplay ? (
            <p className="notation-scale-row next">
              <strong>Next:</strong>{' '}
              <strong className="notation-scale-root">{nextScaleDisplay.rootPitchClass}</strong>{' '}
              {nextScaleDisplay.primaryLabel ? <strong className="notation-scale-primary">{nextScaleDisplay.primaryLabel}</strong> : null}
              {nextScaleDisplay.alternateLabels.length > 0 ? ` / ${nextScaleDisplay.alternateLabels.join(' / ')}` : null}
            </p>
          ) : null}
          <p className="notation-scale-row now">
            <strong>Now:</strong>{' '}
            <strong className="notation-scale-root">{currentScaleDisplay.rootPitchClass}</strong>{' '}
            {currentScaleDisplay.primaryLabel ? <strong className="notation-scale-primary">{currentScaleDisplay.primaryLabel}</strong> : null}
            {currentScaleDisplay.alternateLabels.length > 0 ? ` / ${currentScaleDisplay.alternateLabels.join(' / ')}` : null}
          </p>
        </div>
      ) : null}
      <div className="notation-strip-canvas" ref={containerRef} aria-label="Notation strip" />
    </div>
  );
}
