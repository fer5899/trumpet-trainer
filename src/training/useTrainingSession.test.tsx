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
  NOTE_REVEAL_MS,
  SUSTAIN_MS,
} from '../config/constants';
import type { Exercise } from '../music/melody';
import { writtenToConcert, type Melody } from '../music/notes';
import { createFakeAudioServices, type FakeAudioServices } from '../test/fakeAudioServices';
import {
  concertHz,
  createSessionDriver,
  detune,
  FRAME_MS,
  TIMER_DRIFT_MARGIN_MS,
  type SessionDriver,
} from '../test/sessionDriver';
import { EMPTY_PITCH_GRAPH_VIEW, type PitchGraphView } from './pitchGraph';
import { useTrainingSession, type UseTrainingSessionArgs } from './useTrainingSession';

const MELODY = [71, 60, 72, 54, 66] as const;

let fake: FakeAudioServices;
let mic: MicrophoneSession;
let onExit: ReturnType<typeof vi.fn<() => void>>;
let driver: SessionDriver;

type Props = Pick<UseTrainingSessionArgs, 'noteDurationMs' | 'volume'>;
const DEFAULT_PROPS: Props = { noteDurationMs: DEFAULT_NOTE_DURATION_MS, volume: DEFAULT_VOLUME };

const chromatic = (notes: Melody): Exercise => ({ notes, scale: 'chromatic' });

let renders = 0;

async function setup(thresholdDb = DEFAULT_THRESHOLD_DB, melody: Melody = MELODY, initialProps: Props = DEFAULT_PROPS) {
  renders = 0;
  fake = createFakeAudioServices();
  mic = await fake.services.openMicrophone();
  onExit = vi.fn<() => void>();
  driver = createSessionDriver(fake, 1000);
  const exercise = chromatic(melody);
  const wrapper = ({ children }: { children?: ReactNode }) => (
    <AudioServicesProvider services={fake.services}>{children}</AudioServicesProvider>
  );
  return renderHook((props: Props) => {
    renders += 1;
    return useTrainingSession({ exercise, mic, thresholdDb, onExit, ...props });
  }, {
    wrapper,
    initialProps,
  });
}

const finishPlayback = () => driver.finishPlayback();
const elapse = (ms: number) => driver.elapse(ms);
const toListening = () => driver.toListening();
const hold = (hz: number | null, durationMs: number, levelDb?: number) => driver.hold(hz, durationMs, levelDb);
const reveal = () => driver.reveal();
const matchNote = (hz: number) => driver.matchNote(hz);

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
    expect(result.current.canRepeat).toBe(false);
    expect(result.current.canGiveUp).toBe(false);
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
    expect(result.current.canRepeat).toBe(true);
    expect(result.current.canGiveUp).toBe(true);
  });

  it('does not listen during playing or guard (one subscription from mount, mic ignored)', async () => {
    const { result } = await setup();
    expect(fake.sessions[0].listenerCount).toBe(1);
    await hold(concertHz(MELODY[0]), SUSTAIN_MS * 2);
    await finishPlayback();
    expect(fake.sessions[0].listenerCount).toBe(1);
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
    await reveal();
    await hold(concertHz(60), SUSTAIN_MS);
    expect(result.current.state.matchedCount).toBe(2);
  });

  it('repeat replays, keeps progress, resets the sustain and keeps the mic', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS);
    expect(result.current.state.matchedCount).toBe(1);
    await reveal();
    // Partial progress on note 2, then Repeat.
    await hold(concertHz(MELODY[1]), SUSTAIN_MS - 2 * FRAME_MS);
    act(() => result.current.repeat());
    expect(result.current.state.phase).toBe('playing');
    expect(result.current.canRepeat).toBe(false);
    expect(result.current.canGiveUp).toBe(false);
    expect(fake.playCalls).toHaveLength(2);
    expect(fake.playCalls[1]).toEqual(fake.playCalls[0]);
    expect(result.current.state.matchedCount).toBe(1);
    expect(result.current.boxes[0]).toEqual({ state: 'done', name: 'Si4' });
    expect(result.current.boxes[1].state).toBe('active');
    expect(fake.sessions[0].released).toBe(false);
    expect(fake.sessions[0].listenerCount).toBe(1);
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

  it('completes after the 5th match and its reveal, and exits after COMPLETE_PAUSE_MS', async () => {
    const { result } = await setup();
    await toListening();
    for (const note of MELODY.slice(0, -1)) await matchNote(concertHz(note));
    await hold(concertHz(MELODY[4]), SUSTAIN_MS);
    expect(result.current.state.phase).toBe('reveal');
    expect(result.current.state.matchedCount).toBe(5);
    expect(result.current.canRepeat).toBe(false);
    expect(result.current.canGiveUp).toBe(true);
    expect(result.current.boxes.map((b) => b.state)).toEqual(['done', 'done', 'done', 'done', 'done']);
    await elapse(NOTE_REVEAL_MS - TIMER_DRIFT_MARGIN_MS);
    expect(result.current.state.phase).toBe('reveal');
    await elapse(TIMER_DRIFT_MARGIN_MS);
    expect(result.current.state.phase).toBe('complete');
    expect(result.current.canRepeat).toBe(false);
    expect(result.current.canGiveUp).toBe(false);
    expect(result.current.boxes.map((b) => b.state)).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(result.current.boxes.map((b) => b.name)).toEqual(['Si4', 'Do4', 'Do5', 'Sol♭3', 'Fa#4']);
    expect(fake.sessions[0].listenerCount).toBe(1);
    await elapse(COMPLETE_PAUSE_MS - TIMER_DRIFT_MARGIN_MS);
    expect(onExit).not.toHaveBeenCalled();
    expect(fake.sessions[0].released).toBe(false);
    await elapse(TIMER_DRIFT_MARGIN_MS);
    expect(fake.sessions[0].released).toBe(true);
    expect(fake.sessions[0].listenerCount).toBe(0);
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
      () => useTrainingSession({ exercise: chromatic(MELODY), mic, thresholdDb: DEFAULT_THRESHOLD_DB, onExit, ...DEFAULT_PROPS }),
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

describe('useTrainingSession — live settings', () => {
  it('plays with the note duration and volume passed in', async () => {
    await setup(DEFAULT_THRESHOLD_DB, MELODY, { noteDurationMs: 750, volume: 0.8 });
    expect(fake.playCalls).toEqual([
      { frequenciesHz: MELODY.map(concertHz), noteDurationMs: 750, volume: 0.8, volumeChanges: [] },
    ]);
  });

  it('a volume change while playing calls setVolume once on the running playback without replaying', async () => {
    const { rerender, result } = await setup();
    rerender({ ...DEFAULT_PROPS, volume: 0.8 });
    expect(fake.playCalls).toHaveLength(1);
    expect(fake.playCalls[0].volumeChanges).toEqual([0.8]);
    rerender({ ...DEFAULT_PROPS, volume: 0.8 });
    expect(fake.playCalls[0].volumeChanges).toEqual([0.8]);
    rerender({ ...DEFAULT_PROPS, volume: 0.3 });
    expect(fake.playCalls[0].volumeChanges).toEqual([0.8, 0.3]);
    expect(fake.playCalls).toHaveLength(1);
    expect(fake.stop).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('playing');
  });

  it('no setVolume on mount, on unrelated rerenders, or when nothing is playing', async () => {
    const { rerender } = await setup();
    rerender({ ...DEFAULT_PROPS });
    expect(fake.playCalls[0].volumeChanges).toEqual([]);
    await finishPlayback();
    rerender({ ...DEFAULT_PROPS, volume: 0.9 });
    await toListening();
    rerender({ ...DEFAULT_PROPS, volume: 0.1 });
    expect(fake.playCalls[0].volumeChanges).toEqual([]);
    expect(fake.playCalls).toHaveLength(1);
  });

  it('a note-duration change does not restart playback and applies on the next Repeat; progress is kept', async () => {
    const { rerender, result } = await setup();
    rerender({ ...DEFAULT_PROPS, noteDurationMs: 1500 });
    expect(fake.playCalls).toHaveLength(1);
    expect(fake.stop).not.toHaveBeenCalled();
    await toListening();
    await matchNote(concertHz(MELODY[0]));
    expect(result.current.state.matchedCount).toBe(1);
    rerender({ noteDurationMs: 250, volume: 0.7 });
    expect(result.current.state.phase).toBe('listening');
    expect(fake.sessions[0].listenerCount).toBe(1);
    act(() => result.current.repeat());
    expect(fake.playCalls).toHaveLength(2);
    expect(fake.playCalls[1]).toEqual({
      frequenciesHz: MELODY.map(concertHz),
      noteDurationMs: 250,
      volume: 0.7,
      volumeChanges: [],
    });
    expect(result.current.state.matchedCount).toBe(1);
  });

  it('after Repeat a volume change applies to the new playback only', async () => {
    const { rerender, result } = await setup();
    await toListening();
    act(() => result.current.repeat());
    rerender({ ...DEFAULT_PROPS, volume: 0.25 });
    expect(fake.playCalls[0].volumeChanges).toEqual([]);
    expect(fake.playCalls[1].volumeChanges).toEqual([0.25]);
  });

  it('no setVolume after playback was stopped by give up', async () => {
    const { rerender, result } = await setup();
    act(() => result.current.giveUp());
    rerender({ ...DEFAULT_PROPS, volume: 0.9 });
    expect(fake.playCalls[0].volumeChanges).toEqual([]);
  });
});

describe('useTrainingSession — reveal', () => {
  it('enters reveal right after a match: box done, status advanced, Repeat disabled, Give up enabled', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS);
    expect(result.current.state.phase).toBe('reveal');
    expect(result.current.state.matchedCount).toBe(1);
    expect(result.current.canRepeat).toBe(false);
    expect(result.current.canGiveUp).toBe(true);
    expect(result.current.boxes[0]).toEqual({ state: 'done', name: 'Si4' });
    expect(result.current.boxes[1]).toEqual({ state: 'active', name: null });
  });

  it('returns to listening after NOTE_REVEAL_MS', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS);
    await elapse(NOTE_REVEAL_MS - TIMER_DRIFT_MARGIN_MS);
    expect(result.current.state.phase).toBe('reveal');
    await elapse(TIMER_DRIFT_MARGIN_MS);
    expect(result.current.state.phase).toBe('listening');
    expect(result.current.canRepeat).toBe(true);
  });

  it('repeat is ignored during reveal', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS);
    act(() => result.current.repeat());
    expect(result.current.state.phase).toBe('reveal');
    expect(fake.playCalls).toHaveLength(1);
  });

  it('frames during reveal never fill or match the next note, even at the same pitch', async () => {
    const { result } = await setup(DEFAULT_THRESHOLD_DB, [60, 60, 60, 60, 60]);
    await toListening();
    await hold(concertHz(60), SUSTAIN_MS);
    const detectorCalls = fake.services.detectPitch.mock.calls.length;
    await hold(concertHz(60), SUSTAIN_MS * 2);
    expect(result.current.state.matchedCount).toBe(1);
    expect(result.current.state.phase).toBe('reveal');
    expect(fake.services.detectPitch).toHaveBeenCalledTimes(detectorCalls);
    await reveal();
    await hold(concertHz(60), SUSTAIN_MS - FRAME_MS);
    expect(result.current.state.matchedCount).toBe(1);
    await hold(concertHz(60), 0);
    expect(result.current.state.matchedCount).toBe(2);
  });

  it('keeps exactly one mic listener in every phase', async () => {
    const { result } = await setup(DEFAULT_THRESHOLD_DB, [60, 62, 64]);
    const counts: number[] = [fake.sessions[0].listenerCount];
    await finishPlayback();
    counts.push(fake.sessions[0].listenerCount);
    await elapse(LISTEN_GUARD_MS);
    counts.push(fake.sessions[0].listenerCount);
    await hold(concertHz(60), SUSTAIN_MS);
    expect(result.current.state.phase).toBe('reveal');
    counts.push(fake.sessions[0].listenerCount);
    expect(counts).toEqual([1, 1, 1, 1]);
  });

  it('give up during reveal releases the mic, exits once and leaves no timer', async () => {
    const { result, unmount } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS);
    expect(result.current.state.phase).toBe('reveal');
    act(() => result.current.giveUp());
    act(() => result.current.giveUp());
    expect(fake.sessions[0].released).toBe(true);
    expect(onExit).toHaveBeenCalledTimes(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await elapse(NOTE_REVEAL_MS + COMPLETE_PAUSE_MS);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe('useTrainingSession — wrong notes', () => {
  it('a semitone off held for SUSTAIN_MS is marked wrong and does not advance', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0] + 1), SUSTAIN_MS);
    expect(result.current.state.wrongNotes).toEqual([writtenToConcert(MELODY[0] + 1)]);
    expect(result.current.state.matchedCount).toBe(0);
    expect(result.current.state.phase).toBe('listening');
  });

  it('does not mark a wrong note before SUSTAIN_MS', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0] + 1), SUSTAIN_MS - FRAME_MS);
    expect(result.current.state.wrongNotes).toEqual([]);
  });

  it.each([12, -12])('the right note %s semitones away (octave error) is wrong too', async (offset) => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0] + offset), SUSTAIN_MS * 3);
    expect(result.current.state.wrongNotes).toEqual([writtenToConcert(MELODY[0] + offset)]);
    expect(result.current.state.matchedCount).toBe(0);
  });

  it('several wrong notes are kept in order, across Repeat, and cleared by the right note', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0] + 1), SUSTAIN_MS);
    await hold(null, FRAME_MS);
    await hold(concertHz(MELODY[0] - 1), SUSTAIN_MS);
    const wrong = [writtenToConcert(MELODY[0] + 1), writtenToConcert(MELODY[0] - 1)];
    expect(result.current.state.wrongNotes).toEqual(wrong);
    act(() => result.current.repeat());
    expect(result.current.state.wrongNotes).toEqual(wrong);
    await toListening();
    expect(result.current.state.wrongNotes).toEqual(wrong);
    await matchNote(concertHz(MELODY[0]));
    expect(result.current.state.matchedCount).toBe(1);
    expect(result.current.state.wrongNotes).toEqual([]);
  });
});

describe('useTrainingSession — smoothing', () => {
  it('one frame at +35 c in the middle of a correct hold does not reset it', async () => {
    const { result } = await setup();
    await toListening();
    const hz = concertHz(MELODY[0]);
    await hold(hz, 240); // frames t 1000..1240
    await hold(detune(hz, 35), 0); // t 1260: raw +35 c would reset the hold
    await hold(hz, 200); // t 1280..1480
    expect(result.current.state.matchedCount).toBe(0);
    await hold(hz, 0); // t 1500 = first frame + 500 ms
    expect(result.current.state.matchedCount).toBe(1);
  });

  it('a jump from the semitone above is accepted at the 4th target frame + SUSTAIN_MS', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0] + 1), 200); // t 1000..1200
    // Target frames from t 1220; smoothed +67, +45, +30, then +20 c (inside the band) at t 1280.
    await hold(concertHz(MELODY[0]), 40 + SUSTAIN_MS); // t 1220..1760
    expect(result.current.state.matchedCount).toBe(0);
    expect(result.current.state.wrongNotes).toEqual([]);
    await hold(concertHz(MELODY[0]), 0); // t 1780 = 1280 + 500
    expect(result.current.state.matchedCount).toBe(1);
  });

  it('a single below-threshold frame still resets the hold', async () => {
    const { result } = await setup();
    await toListening();
    const hz = concertHz(MELODY[0]);
    await hold(hz, 240); // t 1000..1240
    await hold(hz, 0, -60); // t 1260 below the threshold
    await hold(hz, SUSTAIN_MS - FRAME_MS); // t 1280..1760
    expect(result.current.state.matchedCount).toBe(0);
    await hold(hz, 0); // t 1780 = 1260 + 20 + 500
    expect(result.current.state.matchedCount).toBe(1);
  });
});

describe('useTrainingSession — rendering', () => {
  it('20 listening frames without a result cause no re-render', async () => {
    await setup();
    await toListening();
    const before = renders;
    await hold(concertHz(MELODY[0]), 19 * FRAME_MS);
    expect(renders).toBe(before);
  });
});

describe('useTrainingSession — graph', () => {
  const snapshot = (result: { current: { graph: { getSnapshot(): PitchGraphView } } }) =>
    result.current.graph.getSnapshot();

  it('graph store identity is stable across rerenders and phases', async () => {
    const { result, rerender } = await setup();
    const graph = result.current.graph;
    expect(graph).toBeDefined();
    rerender({ ...DEFAULT_PROPS, volume: 0.5 });
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS);
    expect(result.current.graph).toBe(graph);
  });

  it('starts empty (idle, no trail, no dot) and frames outside listening never show a dot', async () => {
    const { result } = await setup();
    expect(snapshot(result)).toEqual(EMPTY_PITCH_GRAPH_VIEW);
    await hold(concertHz(MELODY[0]), SUSTAIN_MS);
    expect(snapshot(result)).toEqual(EMPTY_PITCH_GRAPH_VIEW);
    await finishPlayback();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS);
    expect(snapshot(result)).toEqual(EMPTY_PITCH_GRAPH_VIEW);
  });

  it('listening frames show the dot and fill with the hold progress; a null frame clears both', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0]), 200);
    const view = snapshot(result);
    expect(view.dot).toEqual({ x: 0.8, y: expect.closeTo(0, 6) });
    expect(view.bandState).toBe('filling');
    expect(view.fill).toBeCloseTo(200 / SUSTAIN_MS, 6);
    expect(view.segments).toHaveLength(1);
    await hold(null, 0);
    expect(snapshot(result).dot).toBeNull();
    expect(snapshot(result).bandState).toBe('idle');
    expect(snapshot(result).fill).toBe(0);
  });

  it('revealedName is the matched name during reveal only', async () => {
    const { result } = await setup();
    expect(result.current.revealedName).toBeNull();
    await toListening();
    expect(result.current.revealedName).toBeNull();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS);
    expect(result.current.revealedName).toBe('Si4');
    await reveal();
    expect(result.current.revealedName).toBeNull();
  });

  it('green on the matching frame (same act), idle after the reveal without new frames', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS);
    expect(result.current.state.phase).toBe('reveal');
    expect(snapshot(result).bandState).toBe('green');
    expect(snapshot(result).fill).toBe(0);
    await hold(concertHz(MELODY[0]), 100);
    expect(snapshot(result).bandState).toBe('green');
    expect(snapshot(result).dot).toBeNull();
    await reveal();
    expect(result.current.state.phase).toBe('listening');
    expect(snapshot(result).bandState).toBe('idle');
  });

  it('red on the frame completing a wrong note, without fill', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0] + 1), SUSTAIN_MS - FRAME_MS);
    expect(snapshot(result).bandState).toBe('filling');
    await hold(concertHz(MELODY[0] + 1), 0);
    expect(snapshot(result).bandState).toBe('red');
    expect(snapshot(result).fill).toBe(0);
  });

  it('red persists through silence and Repeat; after the right note the band is idle once the reveal ends', async () => {
    const { result } = await setup();
    await toListening();
    await hold(concertHz(MELODY[0] + 1), SUSTAIN_MS);
    await hold(null, FRAME_MS);
    expect(snapshot(result).bandState).toBe('red');
    act(() => result.current.repeat());
    expect(snapshot(result).bandState).toBe('red');
    await toListening();
    await matchNote(concertHz(MELODY[0]));
    expect(snapshot(result).bandState).toBe('idle');
  });

  it('graph frames do not re-render the hook', async () => {
    await setup();
    await toListening();
    const before = renders;
    await hold(concertHz(MELODY[0] + 3), SUSTAIN_MS - FRAME_MS);
    await hold(null, 200);
    expect(renders).toBe(before);
  });
});
