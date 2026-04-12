import { describe, expect, it } from 'vitest';
import { availableFingeredScaleIdsForFamilies, getScaleFingering } from '../../content/scaleFingerings';
import { createDefaultProgressState } from '../storage/progressStore';
import { generateScalePrompt, listPlayableScaleTargets } from './scalePromptGenerator';

describe('scale fingering library', () => {
  it('provides canonical one-octave ionian fingerings for supported roots', () => {
    const fingering = getScaleFingering('ionian', 'C', 1);

    expect(fingering).not.toBeNull();
    expect(fingering?.confidence).toBe('canonical');
    expect(fingering?.sequences.find((sequence) => sequence.hand === 'rh' && sequence.direction === 'ascending')?.fingers)
      .toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    expect(fingering?.sequences.find((sequence) => sequence.hand === 'lh' && sequence.direction === 'ascending')?.fingers)
      .toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
  });

  it('filters scale ids by family and available tonic-specific fingerings', () => {
    expect(availableFingeredScaleIdsForFamilies(['diatonic_modes'], 'C', 1)).toEqual([
      'ionian',
      'dorian',
      'phrygian',
      'lydian',
      'mixolydian',
      'aeolian',
      'locrian',
    ]);
    expect(availableFingeredScaleIdsForFamilies(['melodic_minor_family'], 'C', 1)).toEqual([
      'melodic_minor',
      'dorian_b2',
      'lydian_augmented',
      'mixolydian_b6',
      'locrian_natural_2',
    ]);
  });

  it('provides recommended fingerings for uncommon jazz-color scales', () => {
    const fingering = getScaleFingering('lydian_dominant', 'C', 1);

    expect(fingering).not.toBeNull();
    expect(fingering?.confidence).toBe('recommended');
    expect(fingering?.sequences.find((sequence) => sequence.hand === 'rh' && sequence.direction === 'ascending')?.fingers)
      .toEqual([2, 3, 1, 2, 3, 1, 2, 3]);
  });
});

describe('generateScalePrompt', () => {
  it('builds a treble-clef one-octave C ionian prompt', () => {
    const progress = createDefaultProgressState();
    const prompt = generateScalePrompt({
      config: progress.exerciseConfig,
      progress,
      scaleIdOverride: 'ionian',
      tonicOverride: 'C',
      directionOverride: 'ascending',
    });

    expect(prompt.scaleId).toBe('ionian');
    expect(prompt.tonic).toBe('C');
    expect(prompt.hand).toBe('rh');
    expect(prompt.direction).toBe('ascending');
    expect(prompt.noteSequence.map((note) => note.spelling)).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']);
    expect(prompt.noteSequence.map((note) => note.finger)).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    expect(prompt.noteSequence.map((note) => note.midi)).toEqual([72, 74, 76, 77, 79, 81, 83, 84]);
  });

  it('builds a bass-clef up-down prompt using left-hand fingerings', () => {
    const progress = createDefaultProgressState();
    progress.settings.staffClef = 'bass';
    progress.settings.registerMin = 31;
    progress.settings.registerMax = 55;

    const prompt = generateScalePrompt({
      config: progress.exerciseConfig,
      progress,
      scaleIdOverride: 'ionian',
      tonicOverride: 'C',
      directionOverride: 'up_down',
    });

    expect(prompt.hand).toBe('lh');
    expect(prompt.noteSequence).toHaveLength(15);
    expect(prompt.noteSequence.slice(0, 8).map((note) => note.finger)).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
    expect(prompt.noteSequence[7].midi).toBe(48);
    expect(prompt.noteSequence[prompt.noteSequence.length - 1].midi).toBe(36);
  });

  it('keeps prompt identity stable unless the caller explicitly regenerates it', () => {
    const progress = createDefaultProgressState();

    const first = generateScalePrompt({
      config: progress.exerciseConfig,
      progress,
      promptNonce: 4,
      scaleIdOverride: 'ionian',
      tonicOverride: 'C',
      directionOverride: 'ascending',
    });
    const repeated = generateScalePrompt({
      config: progress.exerciseConfig,
      progress,
      promptNonce: 4,
      scaleIdOverride: 'ionian',
      tonicOverride: 'C',
      directionOverride: 'ascending',
    });
    const regenerated = generateScalePrompt({
      config: progress.exerciseConfig,
      progress,
      promptNonce: 5,
      scaleIdOverride: 'ionian',
      tonicOverride: 'C',
      directionOverride: 'ascending',
    });

    expect(repeated.id).toBe(first.id);
    expect(regenerated.id).not.toBe(first.id);
  });

  it('lists playable scale targets from the current config', () => {
    const progress = createDefaultProgressState();

    expect(listPlayableScaleTargets(progress.exerciseConfig)).toContainEqual({
      scaleId: 'ionian',
      tonic: 'C',
    });
    progress.exerciseConfig.enabledScaleFamilyIds = ['dominant_altered_family'];

    expect(listPlayableScaleTargets(progress.exerciseConfig)).toContainEqual({
      scaleId: 'lydian_dominant',
      tonic: 'C',
    });
  });
});
