import { getLoadedTone, loadTone, type ToneModule } from './toneLoader';

const UNLOCK_EVENT_NAMES = ['pointerdown', 'touchend', 'keydown', 'mousedown'] as const;

let unlockPending = false;

let listenersInstalled = false;

function rawAudioContext(Tone: ToneModule): AudioContext {
  return Tone.getContext().rawContext as AudioContext;
}

function isAppleTouchDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && /Macintosh/.test(navigator.userAgent));
}

/**
 * Resume the raw AudioContext synchronously inside the current user gesture and,
 * on Apple touch devices, prime it with a one-sample silent buffer (the classic
 * WebKit unlock). Notes scheduled while suspended start once the context runs.
 */
function unlockWithTone(Tone: ToneModule): void {
  const rawContext = rawAudioContext(Tone);
  if (rawContext.state === 'running') {
    removeUnlockListeners();
    return;
  }

  if (typeof Tone.start === 'function') {
    void Tone.start().catch(() => {});
  }
  void rawContext.resume().then(() => {
    if (rawAudioContext(Tone).state === 'running') {
      removeUnlockListeners();
    }
  }).catch(() => {});

  if (isAppleTouchDevice()) {
    const buffer = rawContext.createBuffer(1, 1, rawContext.sampleRate);
    const source = rawContext.createBufferSource();
    source.buffer = buffer;
    source.connect(rawContext.destination);
    source.start(0);
  }
}

function handleUnlockEvent(): void {
  unlockAudio();
}

function removeUnlockListeners(): void {
  if (!listenersInstalled) {
    return;
  }
  listenersInstalled = false;
  for (const name of UNLOCK_EVENT_NAMES) {
    window.removeEventListener(name, handleUnlockEvent, true);
  }
}

/**
 * Unlock the Web Audio context. Must be called synchronously from a user-gesture
 * handler; if Tone has not finished loading yet the gesture is recorded and
 * flushed when the load resolves.
 */
export function unlockAudio(): void {
  const Tone = getLoadedTone();
  if (!Tone) {
    unlockPending = true;
    return;
  }

  unlockWithTone(Tone);
}

/**
 * Preload Tone and install window-level capture-phase gesture listeners that
 * unlock the context inside the first user gesture (capture phase so PianoView's
 * stage handlers cannot delay them). The listeners remove themselves once the
 * context is running. Returns a cleanup that removes the listeners.
 */
export function setupAudioUnlock(): () => void {
  void loadTone()
    .then((Tone) => {
      if (unlockPending) {
        unlockPending = false;
        unlockWithTone(Tone);
      }
    })
    .catch(() => {
      unlockPending = false;
    });

  if (!listenersInstalled) {
    listenersInstalled = true;
    for (const name of UNLOCK_EVENT_NAMES) {
      window.addEventListener(name, handleUnlockEvent, true);
    }
  }

  return removeUnlockListeners;
}
