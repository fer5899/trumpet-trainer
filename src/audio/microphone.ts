import { MIC_FFT_SIZE } from '../config/constants';

export type MicrophoneErrorKind = 'permission-denied' | 'unsupported' | 'unknown';

export class MicrophoneError extends Error {
  constructor(
    readonly kind: MicrophoneErrorKind,
    options?: { cause?: unknown },
  ) {
    super(`Microphone unavailable: ${kind}`, options);
    this.name = 'MicrophoneError';
  }
}

/** The frame object and its `samples` are reused between frames: read synchronously, do not retain. */
export interface MicFrame {
  timeMs: number;
  samples: Float32Array;
}

export interface MicrophoneSession {
  readonly sampleRate: number;
  /** Returns an (idempotent) unsubscribe function. */
  subscribe(listener: (frame: MicFrame) => void): () => void;
  /** Idempotent. */
  release(): void;
}

/** Raw signal: browser speech processing would distort or suppress a sustained trumpet tone. */
const RAW_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};

const PERMISSION_ERROR_NAMES = new Set(['NotAllowedError', 'SecurityError']);

function toMicrophoneError(error: unknown): MicrophoneError {
  const name = error instanceof Error || error instanceof DOMException ? error.name : undefined;
  const kind = name !== undefined && PERMISSION_ERROR_NAMES.has(name) ? 'permission-denied' : 'unknown';
  return new MicrophoneError(kind, { cause: error });
}

async function requestStream(): Promise<MediaStream> {
  const mediaDevices = (globalThis.navigator as Navigator | undefined)?.mediaDevices;
  if (typeof mediaDevices?.getUserMedia !== 'function') {
    throw new MicrophoneError('unsupported');
  }
  try {
    return await mediaDevices.getUserMedia(RAW_AUDIO_CONSTRAINTS);
  } catch (error) {
    throw toMicrophoneError(error);
  }
}

/**
 * Thin adapter: opens the microphone and emits time-domain frames on animation frames while
 * anyone is subscribed. The analyser is never connected to the destination (no feedback).
 */
export async function openMicrophone(ctx: AudioContext): Promise<MicrophoneSession> {
  const stream = await requestStream();

  let source: MediaStreamAudioSourceNode;
  let analyser: AnalyserNode;
  try {
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = MIC_FFT_SIZE;
    source.connect(analyser);
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    throw new MicrophoneError('unknown', { cause: error });
  }

  const samples = new Float32Array(analyser.fftSize);
  const frame: MicFrame = { timeMs: 0, samples };
  const listeners = new Set<(frame: MicFrame) => void>();
  // Rebuilt only on (un)subscribe, so a frame neither copies the set nor sees mid-frame changes.
  let snapshot: ReadonlyArray<(frame: MicFrame) => void> = [];
  let frameId: number | null = null;
  let released = false;

  const updateSnapshot = (): void => {
    snapshot = [...listeners];
  };

  const stopLoop = (): void => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  };

  const onFrame = (): void => {
    frameId = null;
    if (released || listeners.size === 0) return;
    analyser.getFloatTimeDomainData(samples);
    frame.timeMs = performance.now();
    try {
      for (const listener of snapshot) listener(frame);
    } finally {
      // Re-arm even if a listener threw, so one bad listener cannot freeze detection.
      if (!released && listeners.size > 0 && frameId === null) {
        frameId = requestAnimationFrame(onFrame);
      }
    }
  };

  const startLoop = (): void => {
    if (frameId === null) frameId = requestAnimationFrame(onFrame);
  };

  return {
    sampleRate: ctx.sampleRate,
    subscribe(listener) {
      if (released) return () => undefined;
      listeners.add(listener);
      updateSnapshot();
      startLoop();
      return () => {
        if (!listeners.delete(listener)) return;
        updateSnapshot();
        if (listeners.size === 0) stopLoop();
      };
    },
    release() {
      if (released) return;
      released = true;
      stopLoop();
      listeners.clear();
      updateSnapshot();
      for (const track of stream.getTracks()) track.stop();
      source.disconnect();
      analyser.disconnect();
    },
  };
}
