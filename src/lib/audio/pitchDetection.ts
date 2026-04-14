export interface PitchObservation {
  timestamp: number;
  rms: number;
  clarity: number;
  frequency: number | null;
}

interface DetectPitchOptions {
  minFrequency?: number;
  maxFrequency?: number;
  minRms?: number;
}

function rootMeanSquare(samples: Float32Array<ArrayBufferLike>): number {
  let sumSquares = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / Math.max(samples.length, 1));
}

function normalizedCorrelation(
  samples: Float32Array<ArrayBufferLike>,
  lag: number,
): number {
  let numerator = 0;
  let sumA = 0;
  let sumB = 0;

  for (let index = 0; index < samples.length - lag; index += 1) {
    const a = samples[index];
    const b = samples[index + lag];
    numerator += a * b;
    sumA += a * a;
    sumB += b * b;
  }

  const denominator = Math.sqrt(sumA * sumB);
  if (denominator <= 1e-9) {
    return 0;
  }

  return numerator / denominator;
}

export function detectPitchObservation(
  samples: Float32Array<ArrayBufferLike>,
  sampleRate: number,
  timestamp: number,
  options: DetectPitchOptions = {},
): PitchObservation {
  const minFrequency = options.minFrequency ?? 65;
  const maxFrequency = options.maxFrequency ?? 1200;
  const minRms = options.minRms ?? 0.01;
  const rms = rootMeanSquare(samples);

  if (rms < minRms) {
    return {
      timestamp,
      rms,
      clarity: 0,
      frequency: null,
    };
  }

  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(samples.length - 2, Math.floor(sampleRate / minFrequency));
  let bestLag = -1;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const correlation = normalizedCorrelation(samples, lag);
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestCorrelation < 0.68) {
    return {
      timestamp,
      rms,
      clarity: bestCorrelation,
      frequency: null,
    };
  }

  const correlationBefore = bestLag > minLag
    ? normalizedCorrelation(samples, bestLag - 1)
    : bestCorrelation;
  const correlationAfter = bestLag < maxLag
    ? normalizedCorrelation(samples, bestLag + 1)
    : bestCorrelation;
  const denominator = (2 * bestCorrelation) - correlationBefore - correlationAfter;
  const lagAdjustment = Math.abs(denominator) > 1e-6
    ? (correlationAfter - correlationBefore) / (2 * denominator)
    : 0;
  const refinedLag = bestLag + lagAdjustment;

  return {
    timestamp,
    rms,
    clarity: bestCorrelation,
    frequency: refinedLag > 0 ? sampleRate / refinedLag : null,
  };
}
