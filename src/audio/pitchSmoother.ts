import { PITCH_SMOOTHING_MS } from '../config/constants';

export interface PitchSmoother {
  /**
   * Feeds one frame. `midi` = fractional concert MIDI of the raw detected pitch, or null when the
   * frame has no valid pitch (no detection, below threshold, ignored). Returns the smoothed value,
   * or null for a null frame.
   */
  push(timeMs: number, midi: number | null): number | null;
  /** Forgets the previous value: the next reading is returned unchanged. */
  reset(): void;
}

/**
 * Time-based exponential moving average on log pitch (MIDI units, so cents are linear): the weight
 * of a reading is 1 − e^(−Δt/τ), which makes it frame-rate independent. The first reading after
 * creation, reset() or a null frame is returned unchanged.
 */
export function createPitchSmoother(timeConstantMs: number = PITCH_SMOOTHING_MS): PitchSmoother {
  let value: number | null = null;
  let lastMs = 0;
  const reset = (): void => {
    value = null;
  };
  return {
    push(timeMs, midi) {
      if (midi === null) {
        reset();
        return null;
      }
      if (value === null) {
        value = midi;
      } else {
        const dt = Math.max(0, timeMs - lastMs);
        value += (1 - Math.exp(-dt / timeConstantMs)) * (midi - value);
      }
      lastMs = timeMs;
      return value;
    },
    reset,
  };
}
