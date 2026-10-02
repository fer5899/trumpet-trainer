import { DB_PER_DECADE, LEVEL_FLOOR_DB } from '../config/constants';

const FULL_SCALE_DB = 0;

/** RMS level in dBFS, clamped to [LEVEL_FLOOR_DB, 0]. Empty or silent buffers → LEVEL_FLOOR_DB. */
export function computeLevelDb(samples: Float32Array): number {
  if (samples.length === 0) return LEVEL_FLOOR_DB;

  let sumOfSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sumOfSquares += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sumOfSquares / samples.length);
  if (!(rms > 0)) return LEVEL_FLOOR_DB;

  const db = DB_PER_DECADE * Math.log10(rms);
  return Math.min(FULL_SCALE_DB, Math.max(LEVEL_FLOOR_DB, db));
}
