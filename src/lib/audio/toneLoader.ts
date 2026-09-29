export type ToneModule = typeof import('tone');

let toneModule: ToneModule | null = null;

let toneModulePromise: Promise<ToneModule> | null = null;

export function loadTone(): Promise<ToneModule> {
  if (!toneModulePromise) {
    toneModulePromise = import('tone').then((module) => {
      toneModule = module;
      return module;
    });
  }

  return toneModulePromise;
}

/** The Tone module once the dynamic import has resolved, null while still loading. */
export function getLoadedTone(): ToneModule | null {
  return toneModule;
}
