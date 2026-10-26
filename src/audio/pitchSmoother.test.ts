import { describe, expect, it } from 'vitest';
import { PITCH_SMOOTHING_MS } from '../config/constants';
import { createPitchSmoother } from './pitchSmoother';

describe('createPitchSmoother', () => {
  it('uses the default time constant PITCH_SMOOTHING_MS (50 ms)', () => {
    expect(PITCH_SMOOTHING_MS).toBe(50);
    const s = createPitchSmoother();
    s.push(0, 69);
    expect(s.push(20, 70)).toBeCloseTo(69 + (1 - Math.exp(-0.4)), 10);
  });

  it('returns the first reading unchanged', () => {
    expect(createPitchSmoother().push(0, 69)).toBe(69);
  });

  it('steps 69 → 70 after 20 ms to 69.3297', () => {
    const s = createPitchSmoother();
    s.push(0, 69);
    expect(s.push(20, 70)).toBeCloseTo(69.3297, 4);
  });

  it.each([
    [0, 0],
    [20, 0.3297],
    [50, 0.6321],
    [100, 0.8647],
    [1000, 1],
  ])('α for Δt = %s ms is %s', (dt, alpha) => {
    const s = createPitchSmoother();
    s.push(0, 0);
    expect(s.push(dt, 1)).toBeCloseTo(alpha, 4);
  });

  it('is frame-rate independent (10 ms vs 20 ms frames both reach 70 − e^−2 at t 100)', () => {
    const run = (step: number): number => {
      const s = createPitchSmoother();
      let value = s.push(0, 69) ?? Number.NaN;
      for (let t = step; t <= 100; t += step) value = s.push(t, 70) ?? Number.NaN;
      return value;
    };
    expect(run(10)).toBeCloseTo(70 - Math.exp(-2), 10);
    expect(run(20)).toBeCloseTo(70 - Math.exp(-2), 10);
    expect(run(10)).toBeCloseTo(69.8647, 4);
  });

  it('keeps a constant reading constant', () => {
    const s = createPitchSmoother();
    for (let t = 0; t <= 1000; t += 20) expect(s.push(t, 69)).toBe(69);
  });

  it('a null frame returns null and resets: the next reading is unchanged', () => {
    const s = createPitchSmoother();
    expect(s.push(0, 69)).toBe(69);
    expect(s.push(20, null)).toBeNull();
    expect(s.push(40, 70)).toBe(70);
  });

  it('time going backwards keeps the value (α = 0)', () => {
    const s = createPitchSmoother();
    expect(s.push(100, 69)).toBe(69);
    expect(s.push(90, 70)).toBe(69);
  });

  it('reset() forgets the previous value', () => {
    const s = createPitchSmoother();
    s.push(0, 69);
    s.reset();
    expect(s.push(20, 70)).toBe(70);
  });

  it('honours a custom time constant', () => {
    const s = createPitchSmoother(100);
    s.push(0, 69);
    expect(s.push(100, 70)).toBeCloseTo(69 + (1 - Math.exp(-1)), 10);
    expect(69 + (1 - Math.exp(-1))).toBeCloseTo(69.6321, 4);
  });
});
