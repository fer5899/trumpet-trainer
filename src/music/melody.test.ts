import { describe, expect, it, vi } from 'vitest';
import { MELODY_LENGTH } from '../config/constants';
import { generateMelody, type Rng } from './melody';

const constantRng = (value: number): Rng => () => value;

function sequenceRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++];
}

describe('generateMelody', () => {
  it.each([
    [0, 54],
    [0.5, 63],
    [0.9999, 72],
    [0.05, 54],
    [0.06, 55],
  ])('maps rng %s to written MIDI %s', (value, expected) => {
    expect(generateMelody(constantRng(value), 1)).toEqual([expected]);
  });

  it('returns MELODY_LENGTH notes by default', () => {
    expect(generateMelody(constantRng(0))).toHaveLength(MELODY_LENGTH);
  });

  it('calls rng exactly `length` times and picks each note independently', () => {
    const rng = vi.fn(sequenceRng([0, 0.5, 0.9999, 0.05, 0.06]));
    expect(generateMelody(rng, 5)).toEqual([54, 63, 72, 54, 55]);
    expect(rng).toHaveBeenCalledTimes(5);
  });

  it('honours a custom length', () => {
    const rng = vi.fn(constantRng(0.5));
    expect(generateMelody(rng, 3)).toEqual([63, 63, 63]);
    expect(rng).toHaveBeenCalledTimes(3);
  });

  it('never exceeds 72 even if rng misbehaves and returns 1', () => {
    expect(generateMelody(constantRng(1), 1)).toEqual([72]);
  });

  it('defaults to Math.random and stays within 54..72 as integers', () => {
    for (let run = 0; run < 200; run += 1) {
      const melody = generateMelody();
      expect(melody).toHaveLength(MELODY_LENGTH);
      for (const m of melody) {
        expect(Number.isInteger(m)).toBe(true);
        expect(m).toBeGreaterThanOrEqual(54);
        expect(m).toBeLessThanOrEqual(72);
      }
    }
  });
});
