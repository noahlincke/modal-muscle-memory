import type { EffectiveInputMode, InputModePreference } from '../../types/progress';

interface ResolveEffectiveInputModeOptions {
  preferredInputMode: InputModePreference;
  midiReady: boolean;
}

export function resolveEffectiveInputMode(
  options: ResolveEffectiveInputModeOptions,
): EffectiveInputMode {
  if (options.preferredInputMode === 'qwerty') {
    return 'qwerty';
  }

  return options.midiReady ? 'midi' : 'mic';
}
