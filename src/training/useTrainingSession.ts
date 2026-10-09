import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useAudioServices } from '../audio/AudioServicesContext';
import { computeLevelDb } from '../audio/level';
import type { MicrophoneSession } from '../audio/microphone';
import type { Playback } from '../audio/synth';
import { COMPLETE_PAUSE_MS, LISTEN_GUARD_MS } from '../config/constants';
import type { Exercise } from '../music/melody';
import { midiToHz, writtenToConcert } from '../music/notes';
import { createSustainTracker } from './sustainTracker';
import {
  createInitialTrainingState,
  selectCanAct,
  selectNoteBoxes,
  trainingReducer,
  type NoteBoxView,
  type TrainingState,
} from './trainingReducer';

export interface UseTrainingSessionArgs {
  exercise: Exercise;
  mic: MicrophoneSession;
  thresholdDb: number;
  /** Live: read when a playback starts (a change applies from the next Repeat). */
  noteDurationMs: number;
  /** Live: applied to the running playback. */
  volume: number;
  onExit: () => void;
}

export interface TrainingSessionView {
  state: TrainingState;
  boxes: NoteBoxView[];
  canAct: boolean;
  /** Dispatches repeatRequested (no-op unless listening). */
  repeat(): void;
  /** Stops playback, releases the mic and calls onExit (allowed in any phase). */
  giveUp(): void;
}

/**
 * Drives one exercise: plays the melody, waits LISTEN_GUARD_MS, then matches microphone frames
 * against the active note. All decisions live in the pure reducer and sustain tracker; this hook
 * only wires them to the audio services with effects keyed on the phase.
 */
export function useTrainingSession({
  exercise,
  mic,
  thresholdDb,
  noteDurationMs,
  volume,
  onExit,
}: UseTrainingSessionArgs): TrainingSessionView {
  const services = useAudioServices();
  const [state, dispatch] = useReducer(trainingReducer, exercise, createInitialTrainingState);
  // One tracker per session; the threshold is fixed for the whole exercise.
  const [tracker] = useState(() => createSustainTracker({ thresholdDb }));
  const { phase, matchedCount, melody } = state;

  // Latest live settings, synced before the playing effect so a Repeat render reads the newest values.
  const noteDurationRef = useRef(noteDurationMs);
  const volumeRef = useRef(volume);
  useEffect(() => {
    noteDurationRef.current = noteDurationMs;
    volumeRef.current = volume;
  });
  /** The running playback and the volume last applied to it; null when nothing is playing. */
  const playbackRef = useRef<{ playback: Playback; volume: number } | null>(null);

  /** Stops the current playback if it is still running (idempotent). */
  const stopPlaybackRef = useRef<() => void>(() => undefined);
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  });

  const exitedRef = useRef(false);
  const exit = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    mic.release();
    onExitRef.current();
  }, [mic]);

  // 1. playing: (re)start the melody; playbackEnded once it is done.
  useEffect(() => {
    if (phase !== 'playing') return;
    tracker.reset();
    let cancelled = false;
    let settled = false;
    // Duration and volume are read from refs, not deps: changing them never restarts playback.
    const playback = services.playMelody(melody.map((m) => midiToHz(writtenToConcert(m))), {
      noteDurationMs: noteDurationRef.current,
      volume: volumeRef.current,
    });
    const entry = { playback, volume: volumeRef.current };
    playbackRef.current = entry;
    const clearEntry = (): void => {
      if (playbackRef.current === entry) playbackRef.current = null;
    };
    const stopIfRunning = (): void => {
      if (settled) return;
      settled = true;
      clearEntry();
      playback.stop();
    };
    stopPlaybackRef.current = stopIfRunning;
    void playback.done.then(() => {
      settled = true;
      clearEntry();
      if (!cancelled) dispatch({ type: 'playbackEnded' });
    });
    return () => {
      cancelled = true;
      // The phase only leaves `playing` after `done`, so this only stops playback on unmount
      // (including React StrictMode's simulated unmount in development).
      stopIfRunning();
    };
  }, [phase, melody, services, tracker]);

  // Volume: applied immediately to the running playback (no call when idle or unchanged).
  useEffect(() => {
    const running = playbackRef.current;
    if (!running || running.volume === volume) return;
    running.playback.setVolume(volume);
    running.volume = volume;
  }, [volume]);

  // 2. guard: silence after playback so the speaker tail is never matched.
  useEffect(() => {
    if (phase !== 'guard') return;
    const timer = setTimeout(() => dispatch({ type: 'guardElapsed' }), LISTEN_GUARD_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // 3. listening: one subscription per active note; it dispatches at most one match.
  useEffect(() => {
    if (phase !== 'listening') return;
    const target = writtenToConcert(melody[matchedCount]);
    let matched = false;
    return mic.subscribe(({ timeMs, samples }) => {
      if (matched) return;
      const levelDb = computeLevelDb(samples);
      const hz =
        levelDb >= thresholdDb ? (services.detectPitch(samples, mic.sampleRate)?.hz ?? null) : null;
      if (tracker.push({ timeMs, hz, levelDb }, target)) {
        matched = true;
        tracker.reset();
        dispatch({ type: 'noteMatched' });
      }
    });
  }, [phase, matchedCount, melody, mic, services, thresholdDb, tracker]);

  // 4. complete: show the all-green boxes for a moment, then leave.
  useEffect(() => {
    if (phase !== 'complete') return;
    const timer = setTimeout(exit, COMPLETE_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [phase, exit]);

  // 5. unmount: release the mic. Deferred by a microtask so React StrictMode's synchronous
  // unmount/remount in development does not kill the session.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (!mountedRef.current) mic.release();
      });
    };
  }, [mic]);

  const repeat = useCallback(() => dispatch({ type: 'repeatRequested' }), []);
  const giveUp = useCallback(() => {
    stopPlaybackRef.current();
    exit();
  }, [exit]);

  const boxes = useMemo(() => selectNoteBoxes(state), [state]);
  return { state, boxes, canAct: selectCanAct(state), repeat, giveUp };
}
