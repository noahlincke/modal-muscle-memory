import {
  createInstrument,
  DEFAULT_INSTRUMENT,
  INSTRUMENTS,
  type InstrumentId,
  type InstrumentPlayer,
} from '../lib/audio/instruments';
import { loadTone } from '../lib/audio/toneLoader';

const LOW_MIDI = 48; // C3
const HIGH_MIDI = 71; // B4
const CHORD_MIDIS = [60, 64, 67, 71]; // C major 7

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

let player: InstrumentPlayer | null = null;
let currentId: InstrumentId = DEFAULT_INSTRUMENT;

const statusEl = document.getElementById('status') as HTMLElement;
const keyboardEl = document.getElementById('keyboard') as HTMLElement;

function ensurePlayer(): InstrumentPlayer {
  if (player && player.id === currentId) {
    return player;
  }
  player?.dispose();
  statusEl.textContent = 'Loading samples…';
  player = createInstrument(currentId, { baseUrl: import.meta.env.BASE_URL });
  void player.loaded.then(() => {
    if (player && player.id === currentId) {
      statusEl.textContent = player.id === 'synth' ? 'Synth voice ready.' : 'Samples loaded.';
    }
  });
  return player;
}

// The AudioContext only unlocks inside a user gesture.
window.addEventListener(
  'pointerdown',
  () => {
    void loadTone().then((Tone) => Tone.start());
    ensurePlayer();
  },
  { once: true },
);

const select = document.getElementById('instrument') as HTMLSelectElement;
for (const info of INSTRUMENTS) {
  const option = document.createElement('option');
  option.value = info.id;
  option.textContent = `${info.label} — ${info.description}`;
  select.appendChild(option);
}
select.value = currentId;
select.addEventListener('change', () => {
  currentId = select.value as InstrumentId;
  ensurePlayer();
});

const WHITE_LETTERS: { [pitchClass: number]: string } = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

const whiteMidis: number[] = [];
for (let midi = LOW_MIDI; midi <= HIGH_MIDI; midi += 1) {
  if (!BLACK_PITCH_CLASSES.has(midi % 12)) {
    whiteMidis.push(midi);
  }
}

function releaseKey(key: HTMLElement, midi: number): void {
  ensurePlayer().noteOff(midi);
  key.classList.remove('active');
}

for (const midi of whiteMidis) {
  const key = document.createElement('div');
  key.className = 'key';
  key.textContent = `${WHITE_LETTERS[midi % 12]}${Math.floor(midi / 12) - 1}`;
  key.dataset.midi = String(midi);
  key.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    key.setPointerCapture(event.pointerId);
    key.classList.add('active');
    ensurePlayer().noteOn(midi);
  });
  key.addEventListener('pointerup', () => releaseKey(key, midi));
  key.addEventListener('pointercancel', () => releaseKey(key, midi));
  keyboardEl.appendChild(key);
}

// Black keys sit between their neighboring white keys.
let whitesBefore = 0;
for (let midi = LOW_MIDI; midi <= HIGH_MIDI; midi += 1) {
  if (!BLACK_PITCH_CLASSES.has(midi % 12)) {
    whitesBefore += 1;
    continue;
  }
  const key = document.createElement('div');
  key.className = 'key black';
  key.dataset.midi = String(midi);
  const whiteWidth = 100 / whiteMidis.length;
  key.style.left = `${whitesBefore * whiteWidth}%`;
  key.style.width = `${whiteWidth * 0.64}%`;
  key.style.transform = 'translateX(-50%)';
  key.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    key.setPointerCapture(event.pointerId);
    key.classList.add('active');
    ensurePlayer().noteOn(midi);
  });
  key.addEventListener('pointerup', () => releaseKey(key, midi));
  key.addEventListener('pointercancel', () => releaseKey(key, midi));
  keyboardEl.appendChild(key);
}

const chordButton = document.getElementById('chord') as HTMLButtonElement;
chordButton.addEventListener('click', () => {
  const active = ensurePlayer();
  for (const midi of CHORD_MIDIS) {
    active.noteOn(midi);
  }
  window.setTimeout(() => {
    for (const midi of CHORD_MIDIS) {
      active.noteOff(midi);
    }
  }, 1500);
});
