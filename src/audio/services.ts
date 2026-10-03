import { getAudioContext, unlockAudio, WebAudioUnsupportedError } from './audioContext';
import { MicrophoneError, openMicrophone, type MicrophoneSession } from './microphone';
import { detectPitch, type PitchResult } from './pitchDetector';
import { playSequence, type Playback } from './synth';

/**
 * The single injection seam between the UI and the browser audio APIs. Components get it via
 * `useAudioServices()`; tests inject fakes.
 */
export interface AudioServices {
  /** Synchronous: call inside click handlers, before any `await`. */
  unlock(): void;
  /** Rejects with `MicrophoneError`. */
  openMicrophone(): Promise<MicrophoneSession>;
  playMelody(frequenciesHz: readonly number[], noteDurationMs: number): Playback;
  detectPitch(samples: Float32Array, sampleRate: number): PitchResult | null;
}

/** Creates the shared context, mapping a failure to the `MicrophoneError` the UI understands. */
function getMicrophoneContext(): AudioContext {
  try {
    return getAudioContext();
  } catch (error) {
    const kind = error instanceof WebAudioUnsupportedError ? 'unsupported' : 'unknown';
    throw new MicrophoneError(kind, { cause: error });
  }
}

/** Real services. The shared AudioContext is created lazily, on the first `unlock()`/use. */
export function createBrowserAudioServices(): AudioServices {
  return {
    unlock: unlockAudio,
    // async: a missing/failed AudioContext rejects instead of throwing inside the caller.
    openMicrophone: async () => openMicrophone(getMicrophoneContext()),
    playMelody: (frequenciesHz, noteDurationMs) =>
      playSequence(getAudioContext(), frequenciesHz, noteDurationMs),
    detectPitch,
  };
}
