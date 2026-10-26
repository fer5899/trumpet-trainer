import { SUSTAIN_MS, TOLERANCE_CENTS } from '../config/constants';
import { centsOffset, nearestMidi, type ConcertMidi } from '../music/notes';

export interface HoldFrame {
  timeMs: number;
  /** Smoothed fractional concert MIDI, or null when the frame has no valid pitch. */
  midi: number | null;
}

export interface HoldStatus {
  /** nearestMidi(midi) of this frame; null without pitch. */
  note: ConcertMidi | null;
  /** 0..1 = min(1, run length / requiredMs); 0 when there is no run. */
  progress: number;
  /** The run's note on the one frame where the run first reaches requiredMs; otherwise null. */
  completed: ConcertMidi | null;
}

export interface HoldTrackerOptions {
  /** Inclusive: |cents| <= toleranceCents. Default TOLERANCE_CENTS. */
  toleranceCents?: number;
  /** Default SUSTAIN_MS. */
  requiredMs?: number;
}

export interface HoldTracker {
  push(frame: HoldFrame, wrongNotes: readonly ConcertMidi[]): HoldStatus;
  /** Ends the current run (next qualifying frame starts a new one). */
  reset(): void;
}

interface Run {
  note: ConcertMidi;
  startMs: number;
  done: boolean;
}

/**
 * Clock-injected "held the nearest semitone within ±toleranceCents for requiredMs" detector. It
 * follows whichever semitone is closest; it knows no target (the caller judges right vs wrong).
 * Notes in `wrongNotes` never start or continue a run.
 */
export function createHoldTracker({
  toleranceCents = TOLERANCE_CENTS,
  requiredMs = SUSTAIN_MS,
}: HoldTrackerOptions = {}): HoldTracker {
  let run: Run | null = null;

  return {
    push({ timeMs, midi }, wrongNotes) {
      if (midi === null) {
        run = null;
        return { note: null, progress: 0, completed: null };
      }
      const note = nearestMidi(midi);
      if (Math.abs(centsOffset(midi)) > toleranceCents || wrongNotes.includes(note)) {
        run = null;
        return { note, progress: 0, completed: null };
      }
      if (run === null || run.note !== note) run = { note, startMs: timeMs, done: false };
      const elapsed = timeMs - run.startMs;
      const progress = Math.min(1, elapsed / requiredMs);
      let completed: ConcertMidi | null = null;
      if (elapsed >= requiredMs && !run.done) {
        run.done = true;
        completed = note;
      }
      return { note, progress, completed };
    },
    reset() {
      run = null;
    },
  };
}
