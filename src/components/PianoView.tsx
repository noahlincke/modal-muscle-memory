import { Midi } from 'tonal';

interface PianoViewProps {
  minMidi: number;
  maxMidi: number;
  targetNotes: number[];
  activeNotes: Set<number>;
  highlightColor: string;
}

function isBlackKey(midi: number): boolean {
  const pc = midi % 12;
  return [1, 3, 6, 8, 10].includes(pc);
}

const WHITE_KEY_WIDTH = 26;
const BLACK_KEY_WIDTH = 16;

interface RenderKey {
  midi: number;
  noteName: string;
}

function toneClass(active: boolean, inTarget: boolean): string {
  if (active && inTarget) return 'is-hit-correct';
  if (active && !inTarget) return 'is-hit-wrong';
  return '';
}

export function PianoView({
  minMidi,
  maxMidi,
  targetNotes,
  activeNotes,
  highlightColor,
}: PianoViewProps) {
  const notes: number[] = [];
  for (let midi = minMidi; midi <= maxMidi; midi += 1) {
    notes.push(midi);
  }

  const targetSet = new Set([...targetNotes].slice(0, 4).sort((a, b) => a - b));
  const whiteKeys: RenderKey[] = notes
    .filter((midi) => !isBlackKey(midi))
    .map((midi) => ({
      midi,
      noteName: Midi.midiToNoteName(midi, { sharps: true }) ?? `M${midi}`,
    }));

  const blackKeys = notes
    .filter((midi) => isBlackKey(midi))
    .map((midi) => {
      const previousWhiteIndex = whiteKeys.reduce((index, key, candidateIndex) => {
        if (key.midi < midi) {
          return candidateIndex;
        }
        return index;
      }, -1);

      return {
        midi,
        noteName: Midi.midiToNoteName(midi, { sharps: true }) ?? `M${midi}`,
        left: previousWhiteIndex < 0
          ? 0
          : ((previousWhiteIndex + 1) * WHITE_KEY_WIDTH) - (BLACK_KEY_WIDTH / 2),
      };
    })
    .filter((key) => key.left > 0 && key.left < (whiteKeys.length * WHITE_KEY_WIDTH));

  return (
    <div className="piano-view">
      <div className="piano-scroll">
        <div className="piano-stage" style={{ width: `${whiteKeys.length * WHITE_KEY_WIDTH}px` }}>
          <div className="piano-white-row">
            {whiteKeys.map((key) => {
              const active = activeNotes.has(key.midi);
              const inTarget = targetSet.has(key.midi);

              return (
                <div
                  key={key.midi}
                  className={`piano-key white ${toneClass(active, inTarget)}`.trim()}
                  role="img"
                  aria-label={`Piano key ${key.noteName}`}
                  style={{ width: `${WHITE_KEY_WIDTH}px` }}
                >
                  {inTarget ? <span className="key-dot" style={{ backgroundColor: highlightColor }} /> : null}
                  {/^(C)\d$/.test(key.noteName) ? <span className="key-label">{key.noteName}</span> : null}
                </div>
              );
            })}
          </div>

          <div className="piano-black-row">
            {blackKeys.map((key) => {
              const active = activeNotes.has(key.midi);
              const inTarget = targetSet.has(key.midi);

              return (
                <div
                  key={key.midi}
                  className={`piano-key black ${toneClass(active, inTarget)}`.trim()}
                  role="img"
                  aria-label={`Piano key ${key.noteName}`}
                  style={{
                    left: `${key.left}px`,
                    width: `${BLACK_KEY_WIDTH}px`,
                  }}
                >
                  {inTarget ? <span className="key-dot" style={{ backgroundColor: highlightColor }} /> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
