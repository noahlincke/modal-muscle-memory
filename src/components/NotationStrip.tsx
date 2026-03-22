import { useEffect, useMemo, useRef } from 'react';
import { Accidental, Formatter, Renderer, Stave, StaveNote, StaveTie, Voice } from 'vexflow';
import { getScaleOption } from '../content/scales';
import { intervalColorForTonicAndRoot } from '../lib/theory/intervalRing';
import { octaveForSpellingAtMidi } from '../lib/theory/noteUtils';
import { resolveRomanToChord } from '../lib/theory/roman';
import type { ExerciseMode, Phrase } from '../types/music';

interface NotationStripProps {
  phrase: Phrase | null;
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
    const horizontalPadding = 48;
    const rightEdgePadding = 28;
    const barWidth = Math.max(260, Math.min(460, Math.floor((containerWidth - horizontalPadding) / barCount)));
    const contentWidth = barCount * barWidth;
    const width = Math.max(containerWidth, contentWidth + horizontalPadding + rightEdgePadding);
    const topHudHeight = exerciseMode === 'improvisation' && clef === 'bass' ? 46 : 0;
    const bottomHudHeight = exerciseMode === 'improvisation' && clef === 'treble' ? 48 : 0;
    const height = 306 + topHudHeight + bottomHudHeight;
    const staveY = 96 + topHudHeight;
    const chordLabelY = 48 + topHudHeight;
    const contentStartX = Math.max(36, Math.floor((width - contentWidth - rightEdgePadding) / 2));

    const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const context = renderer.getContext();
    const { ink: notationInk, completedInk: notationCompletedInk } = notationPalette(theme);

    for (let bar = 1; bar <= barCount; bar += 1) {
      const barEvents = phrase.events.filter((event) => event.bar === bar);
      const x = contentStartX + (bar - 1) * barWidth;
      const stave = new Stave(x, staveY, barWidth - 12);
      if (bar === 1) {
        stave.addClef(clef).addTimeSignature('4/4');
      }
      context.setFillStyle(notationInk);
      context.setStrokeStyle(notationInk);
      stave.setContext(context).draw();

      const renderedNotes: Array<{
        event: Phrase['events'][number];
        token: Phrase['tokensById'][string];
        staveNote: StaveNote;
        eventColor: string;
        showChordLabel: boolean;
      }> = [];
      const ties: StaveTie[] = [];

      barEvents.forEach((event, eventPosition) => {
        const token = phrase.tokensById[event.chordTokenId];
        const keys = token.midiVoicing
          .slice(0, 4)
          .map((note, index) => ({
            midi: note,
            spelling: token.spelledVoicing[index] ?? token.pitchClasses[index] ?? 'C',
          }))
          .sort((a, b) => a.midi - b.midi)
          .map((entry) => spelledMidiToVexKey(entry.spelling, entry.midi));

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

        let previousSegment: StaveNote | null = null;

        durationsForNotation(event.durationBeats).forEach((segmentDuration, segmentIndex) => {
          const staveNote = new StaveNote({
            clef,
            keys: keys.map((entry) => entry.key),
            duration: durationFromBeats(segmentDuration),
          });

          keys.forEach((entry, index) => {
            if (entry.accidental) {
              staveNote.addModifier(new Accidental(entry.accidental), index);
            }
          });

          staveNote.setStyle({ fillStyle: eventColor, strokeStyle: eventColor });

          renderedNotes.push({
            event,
            token,
            staveNote,
            eventColor,
            showChordLabel: eventPosition === 0 && segmentIndex === 0,
          });

          if (previousSegment) {
            ties.push(new StaveTie({
              firstNote: previousSegment,
              lastNote: staveNote,
              firstIndexes: keys.map((_, noteIndex) => noteIndex),
              lastIndexes: keys.map((_, noteIndex) => noteIndex),
            }));
          }

          previousSegment = staveNote;
        });
      });

      const voice = new Voice({ numBeats: 4, beatValue: 4 });
      voice.addTickables(renderedNotes.map((entry) => entry.staveNote));
      new Formatter().joinVoices([voice]).format([voice], Math.max(170, barWidth - (bar === 1 ? 128 : 60)));
      context.setFillStyle(notationInk);
      context.setStrokeStyle(notationInk);
      voice.draw(context, stave);

      ties.forEach((tie) => tie.setContext(context).draw());

      renderedNotes.forEach((entry) => {
        if (!entry.showChordLabel) {
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
    return <div className="notation-strip empty">Phrase loading…</div>;
  }

  return (
    <div className={`notation-strip ${exerciseMode === 'improvisation' ? `improvisation ${clef}` : ''}`.trim()}>
      {exerciseMode === 'improvisation' && currentScaleDisplay ? (
        <div className={`notation-scale-hud ${clef}`.trim()}>
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
