import { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Midi } from 'tonal';
import type { PolySynth } from 'tone';
import { PianoView } from '../components/PianoView';
import '../index.css';

export function TouchLab() {
  const synthRef = useRef<PolySynth | null>(null);
  const [heldNotes, setHeldNotes] = useState<number[]>([]);

  const ensureSynth = useCallback(async () => {
    if (!synthRef.current) {
      const Tone = await import('tone');
      await Tone.start();
      synthRef.current = new Tone.PolySynth().toDestination();
    }
    return synthRef.current;
  }, []);

  const handleNoteOn = useCallback((midi: number, velocity: number) => {
    setHeldNotes((notes) => [...notes, midi].sort((a, b) => a - b));
    void ensureSynth().then((synth) => {
      synth?.triggerAttack(Midi.midiToNoteName(midi) ?? midi, undefined, velocity);
    });
  }, [ensureSynth]);

  const handleNoteOff = useCallback((midi: number) => {
    setHeldNotes((notes) => notes.filter((note) => note !== midi));
    synthRef.current?.triggerRelease(Midi.midiToNoteName(midi) ?? midi);
  }, []);

  return (
    <main
      style={{
        display: 'grid',
        alignContent: 'end',
        gap: '0.6rem',
        minHeight: '100vh',
        padding: '0.5rem',
        boxSizing: 'border-box',
      }}
    >
      <div data-held-notes style={{ fontFamily: 'monospace', fontSize: 18 }}>
        Held: {heldNotes.length > 0 ? heldNotes.join(' ') : '—'}
      </div>
      <PianoView
        tonic="C"
        mode="guided"
        clef="treble"
        minMidi={21}
        maxMidi={108}
        targetNotes={heldNotes}
        chordTonePitchClasses={[]}
        currentScalePitchClasses={[]}
        currentScaleGuideLabels={{}}
        nextScalePitchClasses={[]}
        nextScaleGuideLabels={{}}
        activeNotes={new Set(heldNotes)}
        highlightColor="#0454d5"
        onNoteOn={handleNoteOn}
        onNoteOff={handleNoteOff}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<TouchLab />);
