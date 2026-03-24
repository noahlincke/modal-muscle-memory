import type {
  ContentBlockId,
  CurriculumPresetId,
  KeySetId,
  ModeLane,
  ProgressionFamilyTag,
  ScaleFamilyId,
} from '../types/music';
import type { ExerciseConfig } from '../types/progress';

export interface ContentBlock {
  id: ContentBlockId;
  label: string;
  description: string;
  progressionIds: string[];
  scaleFamilyIds: ScaleFamilyId[];
  progressionFamilyTags: ProgressionFamilyTag[];
}

export interface CurriculumPreset {
  id: CurriculumPresetId;
  label: string;
  description: string;
  fallbackLane: ModeLane;
  enabledContentBlockIds: ContentBlockId[];
  enabledScaleFamilyIds: ScaleFamilyId[];
  enabledProgressionFamilyTags: ProgressionFamilyTag[];
  keySet: KeySetId;
}

export const KEY_SET_OPTIONS: Array<{ id: KeySetId; label: string; description: string }> = [
  { id: 'c_only', label: 'C Only', description: 'C only.' },
  { id: 'max_1_accidental', label: 'Up to 1 Accidental', description: 'C, G, F.' },
  { id: 'max_2_accidentals', label: 'Up to 2 Accidentals', description: 'C, G, F, D, Bb.' },
  { id: 'max_3_accidentals', label: 'Up to 3 Accidentals', description: 'C, G, F, D, Bb, A, Eb.' },
  { id: 'max_4_accidentals', label: 'Up to 4 Accidentals', description: 'C, G, F, D, Bb, A, Eb, E, Ab.' },
  { id: 'max_5_accidentals', label: 'Up to 5 Accidentals', description: 'C, G, F, D, Bb, A, Eb, E, Ab, B, Db.' },
  { id: 'all_keys', label: 'All Keys', description: 'All 12 keys: C, G, F, D, Bb, A, Eb, E, Ab, B, Db, Gb.' },
];

export const SCALE_FAMILY_OPTIONS: Array<{ id: ScaleFamilyId; label: string }> = [
  { id: 'diatonic_modes', label: 'Diatonic Modes' },
  { id: 'pentatonic_blues', label: 'Pentatonic / Blues' },
  { id: 'harmonic_minor_family', label: 'Harmonic Minor' },
  { id: 'melodic_minor_family', label: 'Melodic Minor' },
  { id: 'dominant_altered_family', label: 'Dominant Color' },
  { id: 'symmetric_family', label: 'Symmetric' },
];

export const PROGRESSION_FAMILY_OPTIONS: Array<{ id: ProgressionFamilyTag; label: string }> = [
  { id: 'scalar', label: 'Scalar' },
  { id: 'predominant', label: 'Predominant' },
  { id: 'cadence', label: 'Cadence' },
  { id: 'turnaround', label: 'Turnaround' },
  { id: 'circle_motion', label: 'Circle Motion' },
  { id: 'minor_loop', label: 'Minor Loop' },
  { id: 'borrowed', label: 'Borrowed Color' },
  { id: 'backdoor', label: 'Backdoor' },
  { id: 'modal_vamp', label: 'Modal Vamp' },
  { id: 'secondary_dominant', label: 'Secondary Dominant' },
  { id: 'dominant_cycle', label: 'Dominant Cycle' },
  { id: 'symmetric_color', label: 'Symmetric Color' },
];

export const CONTENT_BLOCKS: ContentBlock[] = [
  {
    id: 'guide_tone_foundations',
    label: 'Guide-Tone Foundations',
    description: 'Guide-tone ii-V-I and circle drills with compact rootless extensions.',
    progressionIds: [
      'guide_tone_ii_v_i',
      'guide_tone_turnaround_cycle',
      'guide_tone_circle_fragment',
      'guide_tone_rootless_resolution',
      'guide_tone_rootless_circle',
    ],
    scaleFamilyIds: ['diatonic_modes'],
    progressionFamilyTags: ['predominant', 'cadence', 'turnaround', 'circle_motion'],
  },
  {
    id: 'major_foundations',
    label: 'Major Foundations',
    description: 'Major-key scalar motion, cadences, and turnarounds.',
    progressionIds: [
      'ionian_scalar_up',
      'ionian_scalar_down',
      'ionian_turnaround',
      'ionian_predominant',
      'ionian_circle_motion',
      'ionian_cadence_return',
    ],
    scaleFamilyIds: ['diatonic_modes', 'pentatonic_blues'],
    progressionFamilyTags: ['scalar', 'cadence', 'turnaround', 'circle_motion', 'predominant'],
  },
  {
    id: 'minor_foundations',
    label: 'Minor Foundations',
    description: 'Aeolian loops and minor-key cadential movement.',
    progressionIds: [
      'aeolian_b67_loop',
      'aeolian_iv_bVII',
      'aeolian_bVI_bIII',
      'aeolian_scalar_lane',
      'aeolian_return_home',
      'aeolian_minor_turn',
    ],
    scaleFamilyIds: ['diatonic_modes', 'pentatonic_blues'],
    progressionFamilyTags: ['minor_loop', 'cadence', 'turnaround'],
  },
  {
    id: 'borrowed_color',
    label: 'Borrowed Color',
    description: 'Major/minor mixture and backdoor color.',
    progressionIds: [
      'ionian_to_borrowed_return',
      'backdoor_bVII',
      'borrowed_minor_chain',
      'parallel_minor_iv',
      'mixed_cadence_return',
      'double_borrowed_then_home',
    ],
    scaleFamilyIds: ['diatonic_modes', 'pentatonic_blues'],
    progressionFamilyTags: ['borrowed', 'backdoor', 'cadence'],
  },
  {
    id: 'modal_colors',
    label: 'Modal Colors',
    description: 'Dorian, Lydian, Mixolydian, and Phrygian-centered vamps and chains.',
    progressionIds: [
      'dorian_modal_pivot',
      'dorian_chain_release',
      'lydian_bright_lift',
      'mixolydian_dominant_vamp',
      'phrygian_pedal_turn',
    ],
    scaleFamilyIds: ['diatonic_modes'],
    progressionFamilyTags: ['modal_vamp', 'cadence', 'circle_motion'],
  },
  {
    id: 'dominant_color',
    label: 'Dominant Color',
    description: 'Secondary dominants, altered dominant color, and extended dominant motion.',
    progressionIds: [
      'secondary_dominant_chain',
      'lydian_dominant_resolve',
      'altered_backcycle',
      'phrygian_dominant_minor_gate',
    ],
    scaleFamilyIds: ['dominant_altered_family', 'melodic_minor_family', 'harmonic_minor_family'],
    progressionFamilyTags: ['secondary_dominant', 'dominant_cycle', 'cadence', 'backdoor'],
  },
  {
    id: 'functional_minor_extensions',
    label: 'Functional Minor',
    description: 'Minor-key functional harmony from harmonic and melodic minor families.',
    progressionIds: [
      'harmonic_minor_cadence',
      'melodic_minor_float',
      'locrian_natural_two_gate',
    ],
    scaleFamilyIds: ['harmonic_minor_family', 'melodic_minor_family'],
    progressionFamilyTags: ['cadence', 'turnaround', 'minor_loop'],
  },
  {
    id: 'symmetric_color',
    label: 'Symmetric Color',
    description: 'Whole-tone and diminished dominant color systems.',
    progressionIds: [
      'whole_tone_drift',
      'half_whole_dominant_cycle',
      'whole_half_release',
    ],
    scaleFamilyIds: ['symmetric_family', 'dominant_altered_family'],
    progressionFamilyTags: ['symmetric_color', 'dominant_cycle'],
  },
];

export const CURRICULUM_PRESETS: CurriculumPreset[] = [
  {
    id: 'major_foundations',
    label: 'Major Foundations',
    description: 'Diatonic major content with inside pentatonic color and a low-accidental key range.',
    fallbackLane: 'ionian',
    enabledContentBlockIds: ['major_foundations'],
    enabledScaleFamilyIds: ['diatonic_modes', 'pentatonic_blues'],
    enabledProgressionFamilyTags: ['scalar', 'cadence', 'turnaround', 'circle_motion', 'predominant'],
    keySet: 'max_2_accidentals',
  },
  {
    id: 'minor_foundations',
    label: 'Minor Foundations',
    description: 'Natural minor loops and cadences with stable minor color in a low-accidental key range.',
    fallbackLane: 'aeolian',
    enabledContentBlockIds: ['minor_foundations'],
    enabledScaleFamilyIds: ['diatonic_modes', 'pentatonic_blues'],
    enabledProgressionFamilyTags: ['minor_loop', 'cadence', 'turnaround'],
    keySet: 'max_2_accidentals',
  },
  {
    id: 'mixture_foundations',
    label: 'Mixture Foundations',
    description: 'Borrowed major/minor color without fully altered harmony.',
    fallbackLane: 'ionian_aeolian_mixture',
    enabledContentBlockIds: ['major_foundations', 'minor_foundations', 'borrowed_color'],
    enabledScaleFamilyIds: ['diatonic_modes', 'pentatonic_blues'],
    enabledProgressionFamilyTags: ['cadence', 'turnaround', 'borrowed', 'backdoor'],
    keySet: 'max_3_accidentals',
  },
  {
    id: 'guide_tone_foundations',
    label: 'Guide-Tone Foundations',
    description: 'ii-V-I and circle practice built around 3rds, 7ths, and compact rootless colors.',
    fallbackLane: 'ionian',
    enabledContentBlockIds: ['guide_tone_foundations'],
    enabledScaleFamilyIds: ['diatonic_modes'],
    enabledProgressionFamilyTags: ['predominant', 'cadence', 'turnaround', 'circle_motion'],
    keySet: 'max_2_accidentals',
  },
  {
    id: 'modal_colors',
    label: 'Modal Colors',
    description: 'Dorian, Lydian, Mixolydian, and Phrygian color blocks.',
    fallbackLane: 'dorian',
    enabledContentBlockIds: ['modal_colors'],
    enabledScaleFamilyIds: ['diatonic_modes'],
    enabledProgressionFamilyTags: ['modal_vamp', 'cadence', 'circle_motion'],
    keySet: 'max_3_accidentals',
  },
  {
    id: 'functional_minor_extensions',
    label: 'Functional Minor',
    description: 'Harmonic and melodic minor families with minor-key cadential motion.',
    fallbackLane: 'aeolian',
    enabledContentBlockIds: ['functional_minor_extensions'],
    enabledScaleFamilyIds: ['harmonic_minor_family', 'melodic_minor_family'],
    enabledProgressionFamilyTags: ['cadence', 'turnaround', 'minor_loop'],
    keySet: 'max_3_accidentals',
  },
  {
    id: 'dominant_and_symmetric',
    label: 'Dominant + Symmetric',
    description: 'Advanced dominant colors, secondary dominants, and symmetric systems.',
    fallbackLane: 'mixolydian',
    enabledContentBlockIds: ['dominant_color', 'symmetric_color'],
    enabledScaleFamilyIds: ['dominant_altered_family', 'melodic_minor_family', 'symmetric_family'],
    enabledProgressionFamilyTags: ['secondary_dominant', 'dominant_cycle', 'symmetric_color', 'backdoor'],
    keySet: 'all_keys',
  },
  {
    id: 'full_library',
    label: 'Full Library',
    description: 'All content blocks, all scale families, and all keys.',
    fallbackLane: 'ionian',
    enabledContentBlockIds: CONTENT_BLOCKS.map((block) => block.id),
    enabledScaleFamilyIds: SCALE_FAMILY_OPTIONS.map((family) => family.id),
    enabledProgressionFamilyTags: PROGRESSION_FAMILY_OPTIONS.map((family) => family.id),
    keySet: 'all_keys',
  },
];

const PRESETS_BY_ID = new Map<CurriculumPresetId, CurriculumPreset>(
  CURRICULUM_PRESETS.map((preset) => [preset.id, preset]),
);

const CONTENT_BLOCKS_BY_ID = new Map<ContentBlockId, ContentBlock>(
  CONTENT_BLOCKS.map((block) => [block.id, block]),
);

const KEY_SET_IDS = new Set<KeySetId>(KEY_SET_OPTIONS.map((option) => option.id));
const SCALE_FAMILY_IDS = new Set<ScaleFamilyId>(SCALE_FAMILY_OPTIONS.map((family) => family.id));
const PROGRESSION_FAMILY_IDS = new Set<ProgressionFamilyTag>(PROGRESSION_FAMILY_OPTIONS.map((family) => family.id));

export function getCurriculumPreset(id: CurriculumPresetId): CurriculumPreset | null {
  return PRESETS_BY_ID.get(id) ?? null;
}

export function getContentBlock(id: ContentBlockId): ContentBlock | null {
  return CONTENT_BLOCKS_BY_ID.get(id) ?? null;
}

export function curriculumPresetIdForLane(lane: ModeLane): CurriculumPresetId {
  if (lane === 'aeolian') {
    return 'minor_foundations';
  }

  if (lane === 'ionian_aeolian_mixture') {
    return 'mixture_foundations';
  }

  return 'major_foundations';
}

export function resolveLaneFromCurriculumPresetId(id: CurriculumPresetId): ModeLane {
  return getCurriculumPreset(id)?.fallbackLane ?? 'ionian';
}

export function normalizeCurriculumPresetId(id: string | null | undefined): CurriculumPresetId {
  if (id && PRESETS_BY_ID.has(id as CurriculumPresetId)) {
    return id as CurriculumPresetId;
  }
  return 'major_foundations';
}

export function normalizeContentBlockIds(ids: string[] | undefined, fallback: ContentBlockId[]): ContentBlockId[] {
  if (ids === undefined) {
    return [...fallback];
  }

  const valid = [...new Set(ids.filter((id): id is ContentBlockId => CONTENT_BLOCKS_BY_ID.has(id as ContentBlockId)))];
  if (ids.length > 0 && valid.length === 0) {
    return [...fallback];
  }

  return valid;
}

export function normalizeScaleFamilyIds(ids: string[] | undefined, fallback: ScaleFamilyId[]): ScaleFamilyId[] {
  if (ids === undefined) {
    return [...fallback];
  }

  const valid = [...new Set(ids.filter((id): id is ScaleFamilyId => SCALE_FAMILY_IDS.has(id as ScaleFamilyId)))];
  if (ids.length > 0 && valid.length === 0) {
    return [...fallback];
  }

  return valid;
}

export function normalizeProgressionFamilyTags(
  ids: string[] | undefined,
  fallback: ProgressionFamilyTag[],
): ProgressionFamilyTag[] {
  if (ids === undefined) {
    return [...fallback];
  }

  const valid = [...new Set(ids.filter((id): id is ProgressionFamilyTag => PROGRESSION_FAMILY_IDS.has(id as ProgressionFamilyTag)))];
  if (ids.length > 0 && valid.length === 0) {
    return [...fallback];
  }

  return valid;
}

export function normalizeKeySetId(id: string | null | undefined, fallback: KeySetId): KeySetId {
  if (id && KEY_SET_IDS.has(id as KeySetId)) {
    return id as KeySetId;
  }
  return fallback;
}

export function applyCurriculumPreset(
  config: ExerciseConfig,
  presetId: CurriculumPresetId,
): ExerciseConfig {
  const preset = getCurriculumPreset(presetId);
  if (!preset) {
    return config;
  }

  return {
    ...config,
    curriculumPresetId: preset.id,
    lane: preset.fallbackLane,
    enabledContentBlockIds: [...preset.enabledContentBlockIds],
    enabledScaleFamilyIds: [...preset.enabledScaleFamilyIds],
    enabledProgressionFamilyTags: [...preset.enabledProgressionFamilyTags],
    keySet: preset.keySet,
  };
}
