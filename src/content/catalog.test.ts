import { describe, expect, it } from 'vitest';
import {
  CONTENT_BLOCKS,
  CURRICULUM_PRESETS,
  KEY_SET_OPTIONS,
  PROGRESSION_FAMILY_OPTIONS,
  SCALE_FAMILY_OPTIONS,
} from './curriculum';
import { rootsForKeySet } from './keys';
import { PROGRESSION_LIBRARY } from './progressions';
import { SCALE_LIBRARY } from './scales';

describe('content catalog', () => {
  it('resolves every content block progression id', () => {
    const progressionIds = new Set(PROGRESSION_LIBRARY.map((progression) => progression.id));

    CONTENT_BLOCKS.forEach((block) => {
      expect(block.progressionIds.length).toBeGreaterThan(0);
      block.progressionIds.forEach((progressionId) => {
        expect(progressionIds.has(progressionId)).toBe(true);
      });
    });
  });

  it('resolves every preset block, scale family, and progression family id', () => {
    const blockIds = new Set(CONTENT_BLOCKS.map((block) => block.id));
    const scaleFamilyIds = new Set(SCALE_FAMILY_OPTIONS.map((family) => family.id));
    const progressionFamilyIds = new Set(PROGRESSION_FAMILY_OPTIONS.map((family) => family.id));

    CURRICULUM_PRESETS.forEach((preset) => {
      expect(preset.enabledContentBlockIds.length).toBeGreaterThan(0);
      expect(preset.enabledScaleFamilyIds.length).toBeGreaterThan(0);
      expect(preset.enabledProgressionFamilyTags.length).toBeGreaterThan(0);

      preset.enabledContentBlockIds.forEach((id) => expect(blockIds.has(id)).toBe(true));
      preset.enabledScaleFamilyIds.forEach((id) => expect(scaleFamilyIds.has(id)).toBe(true));
      preset.enabledProgressionFamilyTags.forEach((id) => expect(progressionFamilyIds.has(id)).toBe(true));
    });
  });

  it('resolves every scale id and chain target in the progression library', () => {
    const progressionIds = new Set(PROGRESSION_LIBRARY.map((progression) => progression.id));

    PROGRESSION_LIBRARY.forEach((progression) => {
      expect(progression.steps.length).toBeGreaterThan(0);
      progression.steps.forEach((step) => {
        [...step.recommendedScaleIds, ...step.colorScaleIds].forEach((scaleId) => {
          expect(SCALE_LIBRARY[scaleId]).toBeDefined();
        });
      });
      progression.chainTargets.forEach((targetId) => {
        expect(progressionIds.has(targetId)).toBe(true);
      });
    });
  });

  it('provides at least one tonic for every key-set option', () => {
    KEY_SET_OPTIONS.forEach((option) => {
      expect(rootsForKeySet(option.id).length).toBeGreaterThan(0);
    });
  });
});
