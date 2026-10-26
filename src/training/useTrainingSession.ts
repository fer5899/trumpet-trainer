import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useAudioServices } from '../audio/AudioServicesContext';
import { computeLevelDb } from '../audio/level';
import type { MicrophoneSession } from '../audio/microphone';
import { createPitchSmoother } from '../audio/pitchSmoother';
import type { Playback } from '../audio/synth';
import { COMPLETE_PAUSE_MS, LISTEN_GUARD_MS, NOTE_REVEAL_MS } from '../config/constants';
import type { Exercise } from '../music/melody';
import { hzToMidi, midiToHz, writtenToConcert } from '../music/notes';
import { createHoldTracker } from './holdTracker';
import { advancePitchGraph, computePitchGraphView, EMPTY_PITCH_GRAPH_MODEL } from './pitchGraph';
import { createPitchGraphStore, type PitchGraphStore } from './pitchGraphStore';
import {
  createInitialTrainingState,
  selectCanGiveUp,
  selectCanRepeat,
  selectExpectedNote,
  selectNoteBoxes,
  selectRevealedName,
  trainingReducer,
  type NoteBoxView,
  type TrainingAction,
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
  /** selectCanRepeat: only while listening. */
  canRepeat: boolean;
  /** selectCanGiveUp: while listening and during the reveal. */
  canGiveUp: boolean;
  /** Dispatches repeatRequested (no-op unless listening). */
  repeat(): void;
  /** Stops playback, releases the mic and calls onExit (allowed in any phase). */
  giveUp(): void;
  /** Stable for the whole session; only PitchGraph subscribes to it. */
  graph: PitchGraphStore;
  /** selectRevealedName(state): the matched note's name during 'reveal', else null. */
  revealedName: string | null;
}

/**
 * Drives one exercise: plays the melody, waits LISTEN_GUARD_MS, then judges smoothed microphone
 * frames: holding any note in tune for SUSTAIN_MS either matches the expected note (→ reveal for
 * NOTE_REVEAL_MS) or marks it wrong. All decisions live in the pure reducer, smoother and hold
 * tracker; this hook only wires them to the audio services with effects keyed on the phase.
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
  // One tracker and smoother per session, never recreated.
  const [tracker] = useState(createHoldTracker);
  const [smoother] = useState(() => createPitchSmoother());
  // Per-frame graph: model + latest hold progress in refs, published through an external store
  // so frames never re-render the hook (only PitchGraph).
  const [graph] = useState(() => createPitchGraphStore());
  const graphModelRef = useRef(EMPTY_PITCH_GRAPH_MODEL);
  const progressRef = useRef(0);
  const { phase, melody, wrongNotes } = state;

  // Synchronous mirror of the reducer state: frames delivered before React commits a dispatch
  // (several per act in tests) already see the new phase, so a match can never fire twice.
  const stateRef = useRef(state);
  const dispatchNow = useCallback(
    (action: TrainingAction) => {
      const prev = stateRef.current;
      const next = trainingReducer(prev, action);
      if (next === prev) return;
      stateRef.current = next;
      if (next.phase !== prev.phase) {
        tracker.reset();
        smoother.reset();
        progressRef.current = 0;
      }
      dispatch(action);
    },
    [tracker, smoother],
  );

  /** Publishes the graph view for the current model, hold progress and (synchronous) reducer state. */
  const publishGraph = useCallback(() => {
    const current = stateRef.current;
    graph.publish(
      computePitchGraphView(graphModelRef.current, {
        progress: progressRef.current,
        wrongNotes: current.wrongNotes,
        revealing: current.phase === 'reveal',
      }),
    );
  }, [graph]);

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
      if (!cancelled) dispatchNow({ type: 'playbackEnded' });
    });
    return () => {
      cancelled = true;
      // The phase only leaves `playing` after `done`, so this only stops playback on unmount
      // (including React StrictMode's simulated unmount in development).
      stopIfRunning();
    };
  }, [phase, melody, services, dispatchNow]);

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
    const timer = setTimeout(() => dispatchNow({ type: 'guardElapsed' }), LISTEN_GUARD_MS);
    return () => clearTimeout(timer);
  }, [phase, dispatchNow]);

  // 3. reveal: the correct note is shown (mic ignored) for NOTE_REVEAL_MS, then listening resumes.
  useEffect(() => {
    if (phase !== 'reveal') return;
    const timer = setTimeout(() => dispatchNow({ type: 'revealElapsed' }), NOTE_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [phase, dispatchNow]);

  // 4. mic frames: one subscription for the whole session. Frames are judged only while
  // listening; in every other phase the mic is ignored (no level, no detection) and the graph
  // gets a null reading, so time keeps scrolling and the dot disappears.
  useEffect(
    () =>
      mic.subscribe(({ timeMs, samples }) => {
        const current = stateRef.current;
        let midi: number | null = null;
        progressRef.current = 0;
        if (current.phase === 'listening') {
          const levelDb = computeLevelDb(samples);
          const hz =
            levelDb >= thresholdDb ? (services.detectPitch(samples, mic.sampleRate)?.hz ?? null) : null;
          midi = smoother.push(timeMs, hz === null ? null : hzToMidi(hz));
          const hold = tracker.push({ timeMs, midi }, current.wrongNotes);
          progressRef.current = hold.progress;
          if (hold.completed !== null) {
            dispatchNow(
              hold.completed === selectExpectedNote(current)
                ? { type: 'noteMatched' }
                : { type: 'wrongNoteHeld', midi: hold.completed },
            );
          }
        }
        // After the dispatch: the accepting frame already shows green, a completed wrong note red.
        graphModelRef.current = advancePitchGraph(graphModelRef.current, { timeMs, midi });
        publishGraph();
      }),
    [mic, services, thresholdDb, tracker, smoother, dispatchNow, publishGraph],
  );

  // Graph sync: phase and red-mark changes (green → grey after the reveal, reds cleared) show
  // at once, without waiting for the next frame.
  useEffect(() => {
    publishGraph();
  }, [phase, wrongNotes, publishGraph]);

  // 5. complete: show the all-green boxes for a moment, then leave.
  useEffect(() => {
    if (phase !== 'complete') return;
    const timer = setTimeout(exit, COMPLETE_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [phase, exit]);

  // 6. unmount: release the mic. Deferred by a microtask so React StrictMode's synchronous
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

  const repeat = useCallback(() => dispatchNow({ type: 'repeatRequested' }), [dispatchNow]);
  const giveUp = useCallback(() => {
    stopPlaybackRef.current();
    exit();
  }, [exit]);

  const boxes = useMemo(() => selectNoteBoxes(state), [state]);
  return {
    state,
    boxes,
    canRepeat: selectCanRepeat(state),
    canGiveUp: selectCanGiveUp(state),
    repeat,
    giveUp,
    graph,
    revealedName: selectRevealedName(state),
  };
}
