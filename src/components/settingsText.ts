import { volumeToPercent } from '../config/settings';

/** Visible values and `aria-valuetext` of the Settings sliders (pure). */

export const formatNoteDuration = (ms: number): string => `${ms} ms`;

/** Master gain 0..1 → "50%". */
export const formatVolume = (volume: number): string => `${volumeToPercent(volume)}%`;

export const formatMelodyLength = (n: number): string => `${n} notes`;

export const formatMaxInterval = (n: number): string => (n === 1 ? '1 semitone' : `${n} semitones`);
