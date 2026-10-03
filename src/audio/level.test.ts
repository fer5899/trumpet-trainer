import { describe, expect, it } from 'vitest';
import { constant, sine, whiteNoise } from '../test/signals';
import { computeLevelDb } from './level';

describe('computeLevelDb', () => {
  it('is 0 dBFS for a constant 1.0', () => {
    expect(computeLevelDb(constant(1, 2048))).toBeCloseTo(0, 6);
  });

  it('is −20 dBFS for a constant 0.1', () => {
    expect(computeLevelDb(constant(0.1, 2048))).toBeCloseTo(-20, 4);
  });

  it('is ≈ −3.01 dBFS for a full-scale sine', () => {
    expect(computeLevelDb(sine(440, 48000, 48000, 1))).toBeCloseTo(-3.01, 2);
  });

  it('returns the floor (−100) for zeros', () => {
    expect(computeLevelDb(new Float32Array(2048))).toBe(-100);
  });

  it('returns the floor (−100) for an empty buffer, never NaN', () => {
    expect(computeLevelDb(new Float32Array(0))).toBe(-100);
  });

  it('clamps very quiet signals to the floor instead of going below it', () => {
    expect(computeLevelDb(constant(1e-8, 2048))).toBe(-100);
  });

  it('clamps signals above full scale to 0', () => {
    expect(computeLevelDb(constant(2, 2048))).toBe(0);
  });

  it('never returns NaN or -Infinity', () => {
    for (const buf of [new Float32Array(0), new Float32Array(16), whiteNoise(2048, 1, 0.3)]) {
      const db = computeLevelDb(buf);
      expect(Number.isFinite(db)).toBe(true);
    }
  });
});
