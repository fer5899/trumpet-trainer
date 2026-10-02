import { SUSTAIN_MS, TOLERANCE_CENTS } from '../config/constants';
import { centsFrom, type ConcertMidi } from '../music/notes';

export interface PitchFrame {
  timeMs: number;
  hz: number | null;
  levelDb: number;
}

export interface SustainTrackerOptions {
  thresholdDb: number;
  toleranceCents?: number;
  requiredMs?: number;
}

export interface SustainTracker {
  /** Returns true once the target has been held in tolerance for `requiredMs` (until reset()). */
  push(frame: PitchFrame, targetConcertMidi: ConcertMidi): boolean;
  reset(): void;
}

/**
 * Clock-injected "held within ±toleranceCents for requiredMs" detector. Time comes from the
 * frames themselves, so it is exact and deterministic regardless of frame rate.
 */
export function createSustainTracker({
  thresholdDb,
  toleranceCents = TOLERANCE_CENTS,
  requiredMs = SUSTAIN_MS,
}: SustainTrackerOptions): SustainTracker {
  let runStartMs: number | null = null;
  let lastTarget: ConcertMidi | null = null;

  const qualifies = ({ hz, levelDb }: PitchFrame, target: ConcertMidi): boolean =>
    hz !== null && levelDb >= thresholdDb && Math.abs(centsFrom(hz, target)) <= toleranceCents;

  return {
    push(frame, target) {
      if (target !== lastTarget) {
        runStartMs = null;
        lastTarget = target;
      }
      if (!qualifies(frame, target)) {
        runStartMs = null;
        return false;
      }
      if (runStartMs === null) runStartMs = frame.timeMs;
      return frame.timeMs - runStartMs >= requiredMs;
    },
    reset() {
      runStartMs = null;
      lastTarget = null;
    },
  };
}
