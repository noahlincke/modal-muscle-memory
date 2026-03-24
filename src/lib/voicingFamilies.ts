import type { VoicingFamily } from '../types/music';

export const VOICING_FAMILIES_IN_ORDER: VoicingFamily[] = [
  'guide_tone_37',
  'guide_tone_73',
  'shell_137',
  'rootless_379',
  'rootless_7313',
  'closed_7th',
  'inversion_1',
  'shell_173',
  'triad_root',
  'inversion_2',
  'six_nine',
  'ninth',
  'slash',
  'rootless',
];

export const VOICING_FAMILY_LABELS: Record<VoicingFamily, string> = {
  triad_root: 'Triad Root',
  guide_tone_37: 'Guide Tone 3-7',
  guide_tone_73: 'Guide Tone 7-3',
  shell_137: 'Shell 1-3-7',
  shell_173: 'Shell 1-7-3',
  rootless_379: 'Rootless 3-7-9',
  rootless_7313: 'Rootless 7-3-13',
  closed_7th: 'Closed 7th',
  inversion_1: '1st Inversion',
  inversion_2: '2nd Inversion',
  six_nine: '6/9',
  ninth: '9th',
  slash: 'Slash',
  rootless: 'Rootless',
};

export function orderedVoicingFamilies(items: VoicingFamily[]): VoicingFamily[] {
  const unique = [...new Set(items)];
  return VOICING_FAMILIES_IN_ORDER.filter((voicing) => unique.includes(voicing));
}
