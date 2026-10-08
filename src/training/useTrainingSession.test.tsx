import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioServicesProvider } from '../audio/AudioServicesContext';
import type { MicrophoneSession } from '../audio/microphone';
import {
  COMPLETE_PAUSE_MS,
  DEFAULT_NOTE_DURATION_MS,
  DEFAULT_THRESHOLD_DB,
  DEFAULT_VOLUME,
  LISTEN_GUARD_MS,
  SUSTAIN_MS,
} from '../config/constants';
import type { Melody } from '../music/notes';
import { createFakeAudioServices, type FakeAudioServices } from '../test/fakeAudioServices';
import {
  concertHz,
  createSessionDriver,
  FRAME_MS,
  TIMER_DRIFT_MARGIN_MS,
  type SessionDriver,
} from '../test/sessionDriver';
import { useTrainingSession } from './useTrainingSession';

const MELODY = [71, 60, 72, 54, 66] as const;

let fake: FakeAudioServices;
let mic: MicrophoneSession;
let onExit: ReturnType<typeof vi.fn<() => void>>;
let driver: SessionDriver;

async function setup(thresholdDb = DEFAULT_THRESHOLD_DB, melody: Melody = MELODY) {
  fake = createFakeAudioServices();
  mic = await fake.services.openMicrophone();
  onExit = vi.fn<() => void>();
  driver = createSessionDriver(fake, 1000);
  const wrapper = ({ children }: { children?: ReactNode }) => (
    <AudioServicesProvider services={fake.services}>{children}</AudioServicesProvider>
  );
  return renderHook(() => useTrainingSession({ melody, mic, thresholdDb, onExit }), { wrapper });
}

const finishPlayback = () => driver.finishPlayback();
const elapse = (ms: number) => driver.elapse(ms);
const toListening = () => driver.toListening();
const hold = (hz: number | null, durationMs: number, levelDb?: number) => driver.hold(hz, durationMs, levelDb);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useTrainingSession', () => {
  it('plays the melody once in concert pitch on mount', async () => {
    const { result } = await setup();
    expect(result.current.state.phase).toBe('playing');
    expect(fake.playCalls).toEqual([
      { frequenciesHz: MELODY.map(concertHz), noteDurationMs: DEFAULT_NOTE_DURATION_MS, volume: DEFAULT_VOLUME, volumeChanges: [] },
    ]);
    expect(result.current.canAct).toBe(false);
    expect(result.current.boxes[0]).toEqual({ state: 'active', name: null });
  });

  it('goes to guard when playback ends and to listening after the guard', async () => {
    const { result } = await setup();
    await finishPlayback();
    expect(result.current.state.phase).toBe('guard');
    await elapse(LISTEN_GUARD_MS - TIMER_DRIFT_MARGIN_MS);
    expect(result.current.state.phase).toBe('guard');
    await elapse(TIMER_DRIFT_MARGIN_MS);
    expect(result.current.state.phase).toBe('listening');
    expect(result.current.canAct).toBe(true);
  });

  it('does not listen during playing or guard', async () => {
    const { result } = await setup();
    expect(fake.sessions[0].listenerCount).toBe(0);
    await hold(concertHz(MELODY[0]), SUSTAIN_MS * 2);
    await finishPlayback();
    expect(fake.sessions[0].listenerCount).toBe(0);
    await hold(concertHz(MELODY[0]), SUSTAIN_MS * 2);
    expect(result.current.state.matchedCount).toBe(0);
    expect(fake.services.detectPitch).not.toHaveBeenCalled();
    await elapse(LISTEN_GUARD_MS);
    expect(fake.sessions[0].listenerCount).toBe(1);
  });

  it('matches a correct tone held for SUSTAIN_MS and advances', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS - FRAME_MS);
    expect(result.current.state.matchedCount).toBe(0);
    await hold(concertHz(MELODY[0]), 0);
    expect(result.current.state.matchedCount).toBe(1);
    expect(result.current.boxes[0]).toEqual({ state: 'done', name: 'Si4' });
    expect(result.current.boxes[1]).toEqual({ state: 'active', name: null });
  });

  it('calls the detector with the session sample rate above the threshold', async () => {
    await setup();
    await toListening();
    await hold(concertHz(MELODY[0]), 0);
    expect(fake.services.detectPitch).toHaveBeenCalledWith(expect.any(Float32Array), 48000);
  });

  it.each([
    ['a wrong note', concertHz(MELODY[0] + 1)],
    ['the right note an octave up', concertHz(MELODY[0] + 12)],
    ['the right note an octave down', concertHz(MELODY[0] - 12)],
    ['no pitch', null],
  ])('%s does nothing', async (_label, hz) => {
    const { result } = await setup();
    await toListening();
    await hold(hz, SUSTAIN_MS * 3);
    expect(result.current.state.matchedCount).toBe(0);
    expect(result.current.state.phase).toBe('listening');
  });

  it('below threshold does nothing and never calls the detector', async () => {
    const { result } = await setup(-30);
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS * 3, -31);
    expect(result.current.state.matchedCount).toBe(0);
    expect(fake.services.detectPitch).not.toHaveBeenCalled();
  });

  it('a single held tone counts only once even if the next note is the same', async () => {
    const { result } = await setup(DEFAULT_THRESHOLD_DB, [60, 60, 60, 60, 60]);
    await toListening();
    await hold(concertHz(60), SUSTAIN_MS);
    expect(result.current.state.matchedCount).toBe(1);
    await hold(concertHz(60), SUSTAIN_MS);
    expect(result.current.state.matchedCount).toBe(2);
  });

  it('repeat replays, keeps progress, resets the sustain and keeps the mic', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS);
    expect(result.current.state.matchedCount).toBe(1);
    // Partial progress on note 2, then Repeat.
    await hold(concertHz(MELODY[1]), SUSTAIN_MS - 2 * FRAME_MS);
    act(() => result.current.repeat());
    expect(result.current.state.phase).toBe('playing');
    expect(result.current.canAct).toBe(false);
    expect(fake.playCalls).toHaveLength(2);
    expect(fake.playCalls[1]).toEqual(fake.playCalls[0]);
    expect(result.current.state.matchedCount).toBe(1);
    expect(result.current.boxes[0]).toEqual({ state: 'done', name: 'Si4' });
    expect(result.current.boxes[1].state).toBe('active');
    expect(fake.sessions[0].released).toBe(false);
    expect(fake.sessions[0].listenerCount).toBe(0);
    await toListening();
    // The earlier partial hold must not carry over.
    await hold(concertHz(MELODY[1]), 2 * FRAME_MS);
    expect(result.current.state.matchedCount).toBe(1);
    await hold(concertHz(MELODY[1]), SUSTAIN_MS);
    expect(result.current.state.matchedCount).toBe(2);
  });

  it('repeat is ignored unless listening', async () => {
    const { result } = await setup();
    act(() => result.current.repeat());
    expect(fake.playCalls).toHaveLength(1);
    await finishPlayback();
    act(() => result.current.repeat());
    expect(result.current.state.phase).toBe('guard');
    expect(fake.playCalls).toHaveLength(1);
  });

  it('give up during playback stops playback, releases the mic and exits', async () => {
    const { result } = await setup();
    act(() => result.current.giveUp());
    expect(fake.stop).toHaveBeenCalledTimes(1);
    expect(fake.sessions[0].released).toBe(true);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('give up while listening releases the mic and exits once', async () => {
    const { result } = await setup();
    await toListening();
    act(() => result.current.giveUp());
    act(() => result.current.giveUp());
    expect(fake.stop).not.toHaveBeenCalled();
    expect(fake.sessions[0].released).toBe(true);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('completes after the 5th match and exits after COMPLETE_PAUSE_MS', async () => {
    const { result } = await setup();
    await toListening();
    for (const note of MELODY) await hold(concertHz(note), SUSTAIN_MS + FRAME_MS);
    expect(result.current.state.phase).toBe('complete');
    expect(result.current.canAct).toBe(false);
    expect(result.current.boxes.map((b) => b.state)).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(result.current.boxes.map((b) => b.name)).toEqual(['Si4', 'Do4', 'Do5', 'Sol♭3', 'Fa#4']);
    expect(fake.sessions[0].listenerCount).toBe(0);
    await elapse(COMPLETE_PAUSE_MS - TIMER_DRIFT_MARGIN_MS);
    expect(onExit).not.toHaveBeenCalled();
    expect(fake.sessions[0].released).toBe(false);
    await elapse(TIMER_DRIFT_MARGIN_MS);
    expect(fake.sessions[0].released).toBe(true);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('unmount stops active playback and releases the mic', async () => {
    const { unmount } = await setup();
    unmount();
    expect(fake.stop).toHaveBeenCalledTimes(1);
    await act(async () => {});
    expect(fake.sessions[0].released).toBe(true);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('unmount during guard clears the timer and does not stop finished playback', async () => {
    const { result, unmount } = await setup();
    await finishPlayback();
    expect(result.current.state.phase).toBe('guard');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(fake.stop).not.toHaveBeenCalled();
  });

  it('survives a StrictMode remount without releasing the mic', async () => {
    fake = createFakeAudioServices();
    mic = await fake.services.openMicrophone();
    onExit = vi.fn<() => void>();
  driver = createSessionDriver(fake, 1000);
    const { StrictMode } = await import('react');
    const { result } = renderHook(
      () => useTrainingSession({ melody: MELODY, mic, thresholdDb: DEFAULT_THRESHOLD_DB, onExit }),
      {
        wrapper: ({ children }: { children?: ReactNode }) => (
          <StrictMode>
            <AudioServicesProvider services={fake.services}>{children}</AudioServicesProvider>
          </StrictMode>
        ),
      },
    );
    await act(async () => {});
    expect(fake.sessions[0].released).toBe(false);
    await toListening();
    expect(result.current.state.phase).toBe('listening');
    expect(fake.sessions[0].listenerCount).toBe(1);
  });
});
