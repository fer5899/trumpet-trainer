import {
  MS_PER_SECOND,
  SYNTH_ATTACK_MS,
  SYNTH_DONE_FALLBACK_MARGIN_MS,
  SYNTH_LOWPASS_HZ,
  SYNTH_LOWPASS_Q,
  SYNTH_PEAK_GAIN,
  SYNTH_RELEASE_MS,
  SYNTH_START_DELAY_MS,
  SYNTH_STOP_FADE_MS,
} from '../config/constants';

export interface Playback {
  /** Resolves (once) when the last note has ended or playback was stopped. */
  readonly done: Promise<void>;
  /** Idempotent: fades out quickly, stops all oscillators and resolves `done`. */
  stop(): void;
}

const SILENT_GAIN = 0;
const UNITY_GAIN = 1;

/**
 * Thin adapter: plays the frequencies back to back as a brass-ish sawtooth through a low-pass
 * filter, each note with its own short envelope so repeated notes are heard as separate attacks.
 *
 * Graph: oscillator_i → noteGain_i (envelope) → shared low-pass → master gain → destination.
 */
export function playSequence(
  ctx: AudioContext,
  frequenciesHz: readonly number[],
  noteDurationMs: number,
): Playback {
  const noteSeconds = noteDurationMs / MS_PER_SECOND;
  const attackSeconds = SYNTH_ATTACK_MS / MS_PER_SECOND;
  const releaseSeconds = SYNTH_RELEASE_MS / MS_PER_SECOND;
  const t0 = ctx.currentTime + SYNTH_START_DELAY_MS / MS_PER_SECOND;

  const master = ctx.createGain();
  master.gain.value = UNITY_GAIN;
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = SYNTH_LOWPASS_HZ;
  filter.Q.value = SYNTH_LOWPASS_Q;
  filter.connect(master);

  const noteNodes = frequenciesHz.map((hz, i) => {
    const start = t0 + i * noteSeconds;
    const end = start + noteSeconds;

    const oscillator = ctx.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = hz;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(SILENT_GAIN, start);
    envelope.gain.linearRampToValueAtTime(SYNTH_PEAK_GAIN, start + attackSeconds);
    envelope.gain.setValueAtTime(SYNTH_PEAK_GAIN, end - releaseSeconds);
    envelope.gain.linearRampToValueAtTime(SILENT_GAIN, end);

    oscillator.connect(envelope);
    envelope.connect(filter);
    oscillator.start(start);
    oscillator.stop(end);
    return { oscillator, envelope };
  });

  const disconnectAll = (): void => {
    for (const { oscillator, envelope } of noteNodes) {
      oscillator.disconnect();
      envelope.disconnect();
    }
    filter.disconnect();
    master.disconnect();
  };

  let finished = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const finish = (): void => {
    if (finished) return;
    finished = true;
    clearTimeout(fallbackTimer);
    resolveDone();
  };

  const finishNaturally = (): void => {
    if (finished) return;
    finish();
    disconnectAll();
  };

  const last = noteNodes.at(-1);
  if (last) {
    last.oscillator.addEventListener('ended', finishNaturally);
    // Safety net in case `ended` never fires (e.g. a suspended context or browser quirks).
    const totalMs = SYNTH_START_DELAY_MS + frequenciesHz.length * noteDurationMs;
    fallbackTimer = setTimeout(finishNaturally, totalMs + SYNTH_DONE_FALLBACK_MARGIN_MS);
  } else {
    finishNaturally();
  }

  return {
    done,
    stop() {
      if (finished) return;
      finish();
      const now = ctx.currentTime;
      const fadeEnd = now + SYNTH_STOP_FADE_MS / MS_PER_SECOND;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(SILENT_GAIN, fadeEnd);
      for (const { oscillator } of noteNodes) {
        try {
          oscillator.stop(fadeEnd);
        } catch {
          // Already stopped or never started: nothing to do.
        }
      }
      setTimeout(disconnectAll, SYNTH_STOP_FADE_MS);
    },
  };
}
