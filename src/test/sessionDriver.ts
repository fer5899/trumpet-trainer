import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { LISTEN_GUARD_MS } from '../config/constants';
import { midiToHz, writtenToConcert } from '../music/notes';
import type { FakeAudioServices } from './fakeAudioServices';

/** Interval between fake microphone frames (≈ 50 fps). */
export const FRAME_MS = 20;
/** Comfortably above the default threshold. */
export const LOUD_DB = -20;
/**
 * Slack for "not yet / now" timer boundary checks. `shouldAdvanceTime` also moves the fake clock
 * 20 ms per 20 ms of real time, so a 1 ms margin before a timer fires is flaky under load.
 */
export const TIMER_DRIFT_MARGIN_MS = 100;

export const concertHz = (written: number): number => midiToHz(writtenToConcert(written));

/** `act`-wrapped steps that drive a training session through fake playback, timers and frames. */
export interface SessionDriver {
  /** Resolves the latest playback's `done`. */
  finishPlayback(): Promise<void>;
  /** Advances the fake timers by `ms`. */
  elapse(ms: number): Promise<void>;
  /** Finishes the current playback and waits out the guard. */
  toListening(): Promise<void>;
  /** Emits a tone every FRAME_MS on the latest mic session, spanning `durationMs` (ends included). */
  hold(hz: number | null, durationMs: number, levelDb?: number): Promise<void>;
}

/**
 * Shared by the App and hook tests. Requires `vi.useFakeTimers({ shouldAdvanceTime: true })`.
 * Frame timestamps start at `startTimeMs` and keep increasing across `hold` calls.
 */
export function createSessionDriver(fake: FakeAudioServices, startTimeMs = 0): SessionDriver {
  let clock = startTimeMs;

  const finishPlayback = async (): Promise<void> => {
    await act(async () => {
      fake.finishPlayback();
    });
  };

  const elapse = async (ms: number): Promise<void> => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  };

  return {
    finishPlayback,
    elapse,
    toListening: async () => {
      await finishPlayback();
      await elapse(LISTEN_GUARD_MS);
    },
    hold: async (hz, durationMs, levelDb = LOUD_DB) => {
      await act(async () => {
        const end = clock + durationMs;
        for (; clock <= end; clock += FRAME_MS) fake.emitTone({ hz, levelDb, timeMs: clock });
      });
    },
  };
}
