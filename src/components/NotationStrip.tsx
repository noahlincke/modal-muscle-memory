import { useEffect, useRef } from 'react';
import { Midi } from 'tonal';
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow';
import { intervalColorForTonicAndRoot } from '../lib/theory/intervalRing';
import type { Phrase } from '../types/music';

interface NotationStripProps {
  phrase: Phrase | null;
  currentEventIndex: number;
  completedEventIds: Set<string>;
  clef: 'treble' | 'bass';
}

function durationFromBeats(durationBeats: number): string {
  if (durationBeats >= 4) return 'w';
  if (durationBeats >= 2) return 'h';
  return 'q';
}

function midiToVexKey(midi: number): { key: string; accidental: string | null } {
  const note = Midi.midiToNoteName(midi, { sharps: true }) ?? 'C4';
  const match = note.match(/^([A-G])([#b]?)(\d)$/);
  if (!match) {
    return { key: 'c/4', accidental: null };
  }

  const [, letter, accidental, octave] = match;
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

export function NotationStrip({
  phrase,
  currentEventIndex,
  completedEventIds,
  clef,
}: NotationStripProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

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
    const barWidth = Math.max(260, Math.min(460, Math.floor((containerWidth - 24) / barCount)));
    const width = Math.max(containerWidth, barCount * barWidth + 16);
    const height = 272;
    const staveY = 82;
    const contentStartX = Math.max(36, Math.floor((width - barCount * barWidth) / 2));

    const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const context = renderer.getContext();

    for (let bar = 1; bar <= barCount; bar += 1) {
      const barEvents = phrase.events.filter((event) => event.bar === bar);
      const x = contentStartX + (bar - 1) * barWidth;
      const stave = new Stave(x, staveY, barWidth - 12);
      if (bar === 1) {
        stave.addClef(clef).addTimeSignature('4/4');
      }
      stave.setContext(context).draw();

      const notes = barEvents.map((event) => {
        const token = phrase.tokensById[event.chordTokenId];
        const keys = token.midiVoicing
          .slice(0, 4)
          .sort((a, b) => a - b)
          .map((note) => midiToVexKey(note));

        const staveNote = new StaveNote({
          clef,
          keys: keys.map((entry) => entry.key),
          duration: durationFromBeats(event.durationBeats),
        });

        keys.forEach((entry, index) => {
          if (entry.accidental) {
            staveNote.addModifier(new Accidental(entry.accidental), index);
          }
        });

        const eventIndex = phrase.events.findIndex((candidate) => candidate.id === event.id);
        const isCompleted = completedEventIds.has(event.id);
        const isCurrent = eventIndex === currentEventIndex;
        const intervalColor = intervalColorForTonicAndRoot(phrase.tonic, token.pitchClasses[0] ?? null);
        let eventColor = intervalColor;

        if (isCompleted) {
          eventColor = 'rgba(31, 40, 45, 0.35)';
        } else if (!isCurrent) {
          eventColor = withAlpha(intervalColor, 0.62);
        }
        staveNote.setStyle({ fillStyle: eventColor, strokeStyle: eventColor });

        return {
          event,
          token,
          staveNote,
          eventColor,
        };
      });

      const voice = new Voice({ numBeats: 4, beatValue: 4 });
      voice.addTickables(notes.map((entry) => entry.staveNote));
      new Formatter().joinVoices([voice]).format([voice], Math.max(170, barWidth - (bar === 1 ? 128 : 60)));
      voice.draw(context, stave);

      notes.forEach((entry) => {
        const xPos = entry.staveNote.getAbsoluteX() - 16;
        context.setFont('17px "IBM Plex Sans", sans-serif');
        context.setFillStyle(entry.eventColor);
        context.fillText(entry.token.symbol, xPos, 48);
      });
    }
  }, [phrase, currentEventIndex, completedEventIds, clef]);

  if (!phrase) {
    return <div className="notation-strip empty">Phrase loading…</div>;
  }

  return <div className="notation-strip" ref={containerRef} aria-label="Notation strip" />;
}
