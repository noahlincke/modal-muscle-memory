import type { ParsedMidiMessage } from './midiParser';

export interface ScaleSubmission {
  noteNumber: number;
  timestamp: number;
}

export class ScaleCapture {
  activeNoteNumbers = new Set<number>();

  heldNoteNumbers = new Set<number>();

  sustainPedalDown = false;

  ingest(
    message: ParsedMidiMessage,
  ): ScaleSubmission | null {
    if (message.type === 'note_on') {
      const isRepeatWhileHeld = this.heldNoteNumbers.has(message.noteNumber);
      this.activeNoteNumbers.add(message.noteNumber);
      this.heldNoteNumbers.add(message.noteNumber);
      if (isRepeatWhileHeld) {
        return null;
      }

      return {
        noteNumber: message.noteNumber,
        timestamp: message.timestamp,
      };
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

  clear(): void {
    this.activeNoteNumbers.clear();
    this.heldNoteNumbers.clear();
    this.sustainPedalDown = false;
  }
}
