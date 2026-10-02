import { describe, expect, it } from 'vitest';
import { centsFrom } from '../music/notes';
import { sawtooth, sine, whiteNoise } from '../test/signals';
import { detectPitch } from './pitchDetector';

const LENGTH = 2048;
const TOLERANCE = 5; // cents (PRD acceptance criterion)

/** Cents between two frequencies. */
function centsBetween(hz: number, referenceHz: number): number {
  return 1200 * Math.log2(hz / referenceHz);
}

describe('detectPitch', () => {
  describe.each([48000, 44100])('at %i Hz sample rate', (sampleRate) => {
    describe.each([
      ['concert E3', 164.81],
      ['concert A4', 440],
      ['concert B♭4', 466.16],
    ])('%s (%s Hz)', (_label, hz) => {
      it.each([
        ['sine', sine],
        ['sawtooth', sawtooth],
      ])('detects a %s within ±5 cents', (_wave, generate) => {
        const result = detectPitch(generate(hz, sampleRate, LENGTH, 0.5), sampleRate);
        expect(result).not.toBeNull();
        expect(Math.abs(centsBetween(result!.hz, hz))).toBeLessThanOrEqual(TOLERANCE);
        expect(result!.clarity).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('returns null for silence', () => {
      expect(detectPitch(new Float32Array(LENGTH), sampleRate)).toBeNull();
    });

    it.each([1, 2, 3, 42])('returns null for seeded white noise (seed %i)', (seed) => {
      expect(detectPitch(whiteNoise(LENGTH, seed, 0.5), sampleRate)).toBeNull();
    });

    it('returns null for a 100 Hz tone (below range)', () => {
      expect(detectPitch(sine(100, sampleRate, LENGTH, 0.5), sampleRate)).toBeNull();
    });

    it('returns null for an 800 Hz tone (above range)', () => {
      expect(detectPitch(sine(800, sampleRate, LENGTH, 0.5), sampleRate)).toBeNull();
    });
  });

  it('accepts tones at the edges of the detection range', () => {
    const low = detectPitch(sine(155, 48000, LENGTH, 0.5), 48000);
    const high = detectPitch(sine(495, 48000, LENGTH, 0.5), 48000);
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
  });

  it('works with other buffer lengths (detector cached per length)', () => {
    const a = detectPitch(sine(440, 48000, 4096, 0.5), 48000);
    const b = detectPitch(sine(440, 48000, LENGTH, 0.5), 48000);
    const c = detectPitch(sine(440, 48000, 4096, 0.5), 48000);
    expect(Math.abs(centsFrom(a!.hz, 69))).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(centsFrom(b!.hz, 69))).toBeLessThanOrEqual(TOLERANCE);
    expect(c).toEqual(a);
  });
});
