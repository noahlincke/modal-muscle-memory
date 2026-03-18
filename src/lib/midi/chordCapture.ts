import type { ParsedMidiMessage } from './midiParser';
import { midiToPitchClass } from '../theory/noteUtils';

export interface ChordSubmission {
  notes: number[];
  pitchClasses: string[];
  timestamp: number;
  reason: 'required_detected' | 'burst_closed';
}

interface ChordCaptureOptions {
  simultaneityWindowMs?: number;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

export class ChordCapture {
  activeNoteNumbers = new Set<number>();

  heldNoteNumbers = new Set<number>();

  sustainPedalDown = false;

  recentNoteOns: Array<{ note: number; timestamp: number }> = [];

  private readonly simultaneityWindowMs: number;

  constructor(options: ChordCaptureOptions = {}) {
    this.simultaneityWindowMs = options.simultaneityWindowMs ?? 90;
  }

  get activePitchClasses(): Set<string> {
    return new Set(Array.from(this.activeNoteNumbers).map((note) => midiToPitchClass(note)));
  }

  ingest(
    message: ParsedMidiMessage,
    requiredPitchClasses: string[] = [],
  ): ChordSubmission | null {
    if (message.type === 'note_on') {
      this.activeNoteNumbers.add(message.noteNumber);
      this.heldNoteNumbers.add(message.noteNumber);
      this.recentNoteOns.push({ note: message.noteNumber, timestamp: message.timestamp });

      if (requiredPitchClasses.length > 0 && this.containsRequired(requiredPitchClasses)) {
        return this.buildSubmission(message.timestamp, 'required_detected');
      }
    }

    if (message.type === 'note_off') {
      this.heldNoteNumbers.delete(message.noteNumber);
      if (!this.sustainPedalDown) {
        this.activeNoteNumbers.delete(message.noteNumber);
      }
    }

    if (message.type === 'sustain') {
      this.sustainPedalDown = message.isDown;
      if (!message.isDown) {
        const held = new Set(this.heldNoteNumbers);
        this.activeNoteNumbers.forEach((note) => {
          if (!held.has(note)) {
            this.activeNoteNumbers.delete(note);
          }
        });
      }
    }

    return null;
  }

  flush(now: number, requiredPitchClasses: string[] = []): ChordSubmission | null {
    if (this.recentNoteOns.length === 0) {
      return null;
    }

    const last = this.recentNoteOns[this.recentNoteOns.length - 1];
    const idleMs = now - last.timestamp;

    if (requiredPitchClasses.length > 0 && this.containsRequired(requiredPitchClasses)) {
      return this.buildSubmission(now, 'required_detected');
    }

    if (idleMs >= this.simultaneityWindowMs) {
      return this.buildSubmission(now, 'burst_closed');
    }

    return null;
  }

  clearRecent(): void {
    this.recentNoteOns = [];
  }

  private containsRequired(requiredPitchClasses: string[]): boolean {
    const active = this.activePitchClasses;
    return requiredPitchClasses.every((pitchClass) => active.has(pitchClass));
  }

  private buildSubmission(
    timestamp: number,
    reason: ChordSubmission['reason'],
  ): ChordSubmission {
    const notes = Array.from(this.activeNoteNumbers).sort((a, b) => a - b);
    const pitchClasses = unique(notes.map((note) => midiToPitchClass(note)));
    this.clearRecent();
    return {
      notes,
      pitchClasses,
      timestamp,
      reason,
    };
  }
}
