import { describe, expect, it } from 'vitest';
import { formatMaxInterval, formatMelodyLength, formatNoteDuration, formatVolume } from './settingsText';

describe('settingsText', () => {
  it.each([
    [250, '250 ms'],
    [1000, '1000 ms'],
    [1500, '1500 ms'],
  ])('formatNoteDuration(%i) → %s', (ms, text) => {
    expect(formatNoteDuration(ms)).toBe(text);
  });

  it.each([
    [0, '0%'],
    [0.05, '5%'],
    [0.35, '35%'],
    [0.5, '50%'],
    [1, '100%'],
  ])('formatVolume(%f) → %s', (volume, text) => {
    expect(formatVolume(volume)).toBe(text);
  });

  it.each([
    [3, '3 notes'],
    [5, '5 notes'],
    [8, '8 notes'],
  ])('formatMelodyLength(%i) → %s', (n, text) => {
    expect(formatMelodyLength(n)).toBe(text);
  });

  it.each([
    [1, '1 semitone'],
    [2, '2 semitones'],
    [12, '12 semitones'],
    [18, '18 semitones'],
  ])('formatMaxInterval(%i) → %s', (n, text) => {
    expect(formatMaxInterval(n)).toBe(text);
  });
});
