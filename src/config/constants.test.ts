import { describe, expect, it } from 'vitest';
import * as C from './constants';

describe('constants', () => {
  it.each([
    ['WRITTEN_MIN_MIDI', 54],
    ['WRITTEN_MAX_MIDI', 72],
    ['TRANSPOSITION_SEMITONES', -2],
    ['A4_MIDI', 69],
    ['A4_HZ', 440],
    ['MELODY_LENGTH', 5],
    ['NOTE_DURATION_MS', 500],
    ['LISTEN_GUARD_MS', 250],
    ['COMPLETE_PAUSE_MS', 1500],
    ['TOLERANCE_CENTS', 25],
    ['SUSTAIN_MS', 500],
    ['MIN_DETECT_HZ', 150],
    ['MAX_DETECT_HZ', 500],
    ['MIN_CLARITY', 0.9],
    ['LEVEL_FLOOR_DB', -100],
    ['METER_MIN_DB', -60],
    ['METER_MAX_DB', 0],
    ['DEFAULT_THRESHOLD_DB', -40],
    ['THRESHOLD_STEP_DB', 1],
    ['MIC_FFT_SIZE', 2048],
    ['SYNTH_PEAK_GAIN', 0.25],
    ['SYNTH_ATTACK_MS', 15],
    ['SYNTH_RELEASE_MS', 30],
    ['SYNTH_LOWPASS_HZ', 2000],
    ['SYNTH_LOWPASS_Q', 0.7],
    ['SYNTH_START_DELAY_MS', 50],
  ] as const)('%s = %s', (name, value) => {
    expect((C as Record<string, unknown>)[name]).toBe(value);
  });

  it('keeps the default threshold inside the meter range', () => {
    expect(C.DEFAULT_THRESHOLD_DB).toBeGreaterThanOrEqual(C.METER_MIN_DB);
    expect(C.DEFAULT_THRESHOLD_DB).toBeLessThanOrEqual(C.METER_MAX_DB);
  });

  it('uses an fftSize of at least 2048 so low notes fit in a frame', () => {
    expect(C.MIC_FFT_SIZE).toBeGreaterThanOrEqual(2048);
  });
});
