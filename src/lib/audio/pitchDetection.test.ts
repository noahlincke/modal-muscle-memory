import { describe, expect, it } from 'vitest';
import { detectPitchObservation } from './pitchDetection';

function sineWave(
  frequency: number,
  amplitude: number,
  sampleRate = 44_100,
  length = 2048,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(length) as Float32Array<ArrayBuffer>;

  for (let index = 0; index < length; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * amplitude;
  }

  return samples;
}

describe('detectPitchObservation', () => {
  it('detects a quieter low note that sits below the old minimum frequency floor', () => {
    const observation = detectPitchObservation(
      sineWave(55, 0.006),
      44_100,
      0,
    );

    expect(observation.frequency).not.toBeNull();
    expect(observation.frequency).toBeGreaterThan(53);
    expect(observation.frequency).toBeLessThan(57);
    expect(observation.clarity).toBeGreaterThan(0.58);
  });
});
