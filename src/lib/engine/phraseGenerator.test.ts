import { describe, expect, it } from 'vitest';
import { generatePhrase } from './phraseGenerator';
import { createDefaultProgressState } from '../storage/progressStore';

function seededRandom(seed = 42): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

describe('phraseGenerator', () => {
  it('generates valid phrases with linked tokens', () => {
    const progress = createDefaultProgressState();
    const random = seededRandom(11);

    const phrase = generatePhrase({
      lane: 'ionian',
      progress,
      tempo: 78,
      random,
    });

    expect(phrase.events.length).toBeGreaterThan(0);
    phrase.events.forEach((event) => {
      expect(phrase.tokensById[event.chordTokenId]).toBeDefined();
      expect(event.bar).toBeGreaterThan(0);
      expect(event.beat).toBeGreaterThan(0);
    });
  });

  it('can generate at least 30 unique starter phrases across MVP lanes', () => {
    const progress = createDefaultProgressState();
    const random = seededRandom(77);

    progress.unlocksByLane.ionian.roots = ['C', 'G', 'F'];
    progress.unlocksByLane.ionian.voicings = ['shell_137', 'closed_7th', 'inversion_1'];
    progress.unlocksByLane.aeolian.roots = ['A', 'E', 'D'];
    progress.unlocksByLane.aeolian.voicings = ['shell_137', 'closed_7th', 'inversion_1'];
    progress.unlocksByLane.ionian_aeolian_mixture.roots = ['C', 'G', 'F'];
    progress.unlocksByLane.ionian_aeolian_mixture.voicings = ['shell_137', 'closed_7th', 'inversion_1'];

    const signatures = new Set<string>();

    const lanes: Array<'ionian' | 'aeolian' | 'ionian_aeolian_mixture'> = [
      'ionian',
      'aeolian',
      'ionian_aeolian_mixture',
    ];

    lanes.forEach((lane) => {
      for (let i = 0; i < 90; i += 1) {
        const phrase = generatePhrase({ lane, progress, tempo: 82, random });
        const signature = [
          lane,
          phrase.templateId,
          phrase.tonic,
          phrase.events.map((event) => event.rhythmCellId).join('-'),
          phrase.events
            .map((event) => phrase.tokensById[event.chordTokenId].voicingFamily)
            .join('-'),
        ].join('|');

        signatures.add(signature);
      }
    });

    expect(signatures.size).toBeGreaterThanOrEqual(30);
  });
});
