import { getAudioContext, unlockAudio } from './audioContext';
import { openMicrophone, type MicrophoneSession } from './microphone';
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

/** Real services. The shared AudioContext is created lazily, on the first `unlock()`/use. */
export function createBrowserAudioServices(): AudioServices {
  return {
    unlock: unlockAudio,
    openMicrophone: () => openMicrophone(getAudioContext()),
    playMelody: (frequenciesHz, noteDurationMs) =>
      playSequence(getAudioContext(), frequenciesHz, noteDurationMs),
    detectPitch,
  };
}
