import { vi } from 'vitest';
import {
  MicrophoneError,
  type MicFrame,
  type MicrophoneErrorKind,
  type MicrophoneSession,
} from '../audio/microphone';
import type { PitchResult } from '../audio/pitchDetector';
import type { AudioServices } from '../audio/services';
import type { Playback, PlaybackOptions } from '../audio/synth';
import { DB_PER_DECADE, MIC_FFT_SIZE } from '../config/constants';

export const FAKE_SAMPLE_RATE = 48000;

export interface FakeMicrophoneSession extends MicrophoneSession {
  readonly released: boolean;
  readonly listenerCount: number;
  /** Delivers a frame to the current listeners (no-op once released). */
  emit(frame: MicFrame): void;
}

export interface PlayCall {
  frequenciesHz: readonly number[];
  noteDurationMs: number;
  volume: number;
  /** Every setVolume(v) call on this playback, in order (recorded even after done/stop). */
  volumeChanges: number[];
}

export interface FakeTone {
  hz: number | null;
  levelDb: number;
  timeMs: number;
}

export interface FakeAudioServices {
  services: AudioServices & {
    unlock: ReturnType<typeof vi.fn<() => void>>;
    openMicrophone: ReturnType<typeof vi.fn<() => Promise<MicrophoneSession>>>;
    playMelody: ReturnType<typeof vi.fn<(frequenciesHz: readonly number[], options: PlaybackOptions) => Playback>>;
    detectPitch: ReturnType<typeof vi.fn<(samples: Float32Array, sampleRate: number) => PitchResult | null>>;
  };
  /** Makes the next `openMicrophone` reject with `new MicrophoneError(kind)`. */
  failNextMicrophone(kind: MicrophoneErrorKind): void;
  /** Every session opened so far, oldest first. */
  sessions: FakeMicrophoneSession[];
  /** Sets the value the fake detector returns and emits a constant-level frame on the latest session. */
  emitTone(tone: FakeTone): void;
  playCalls: PlayCall[];
  /** Resolves the latest playback's `done`. */
  finishPlayback(): void;
  /** Spy called by every playback's `stop()`; it also resolves that playback's `done`. */
  stop: ReturnType<typeof vi.fn<() => void>>;
}

function createFakeSession(): FakeMicrophoneSession {
  const listeners = new Set<(frame: MicFrame) => void>();
  let released = false;
  return {
    sampleRate: FAKE_SAMPLE_RATE,
    get released() {
      return released;
    },
    get listenerCount() {
      return listeners.size;
    },
    subscribe(listener) {
      if (released) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    release() {
      released = true;
      listeners.clear();
    },
    emit(frame) {
      for (const listener of [...listeners]) listener(frame);
    },
  };
}

/** Test double for `AudioServices`; inject it through `<AudioServicesProvider>`. */
export function createFakeAudioServices(): FakeAudioServices {
  const sessions: FakeMicrophoneSession[] = [];
  const playCalls: PlayCall[] = [];
  const resolvers: (() => void)[] = [];
  let nextFailure: MicrophoneErrorKind | null = null;
  let detected: PitchResult | null = null;

  const stop = vi.fn<() => void>();

  const services: FakeAudioServices['services'] = {
    unlock: vi.fn<() => void>(),
    openMicrophone: vi.fn<() => Promise<MicrophoneSession>>(() => {
      if (nextFailure !== null) {
        const kind = nextFailure;
        nextFailure = null;
        return Promise.reject(new MicrophoneError(kind));
      }
      const session = createFakeSession();
      sessions.push(session);
      return Promise.resolve(session);
    }),
    playMelody: vi.fn((frequenciesHz: readonly number[], { noteDurationMs, volume }: PlaybackOptions): Playback => {
      const call: PlayCall = { frequenciesHz: [...frequenciesHz], noteDurationMs, volume, volumeChanges: [] };
      playCalls.push(call);
      let resolveDone!: () => void;
      const done = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });
      resolvers.push(resolveDone);
      return {
        done,
        stop() {
          stop();
          resolveDone();
        },
        setVolume(nextVolume) {
          call.volumeChanges.push(nextVolume);
        },
      };
    }),
    detectPitch: vi.fn<(samples: Float32Array, sampleRate: number) => PitchResult | null>(() => detected),
  };

  return {
    services,
    sessions,
    playCalls,
    stop,
    failNextMicrophone(kind) {
      nextFailure = kind;
    },
    emitTone({ hz, levelDb, timeMs }) {
      const session = sessions.at(-1);
      if (!session) throw new Error('emitTone: no microphone session has been opened');
      detected = hz === null ? null : { hz, clarity: 1 };
      const amplitude = 10 ** (levelDb / DB_PER_DECADE);
      session.emit({ timeMs, samples: new Float32Array(MIC_FFT_SIZE).fill(amplitude) });
    },
    finishPlayback() {
      const resolve = resolvers.at(-1);
      if (!resolve) throw new Error('finishPlayback: nothing is playing');
      resolve();
    },
  };
}
