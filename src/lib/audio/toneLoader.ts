type ToneModule = typeof import('tone');

let toneModulePromise: Promise<ToneModule> | null = null;

export function loadTone(): Promise<ToneModule> {
  if (!toneModulePromise) {
    toneModulePromise = import('tone');
  }

  return toneModulePromise;
}
