import { describe, expect, it } from 'vitest';
import * as C from './constants';

describe('constants', () => {
  it.each([
    ['WRITTEN_MIN_MIDI', 54],
    ['WRITTEN_MAX_MIDI', 72],
    ['TRANSPOSITION_SEMITONES', -2],
    ['A4_MIDI', 69],
    ['A4_HZ', 440],
    ['DEFAULT_NOTE_DURATION_MS', 1000],
    ['MIN_NOTE_DURATION_MS', 250],
    ['MAX_NOTE_DURATION_MS', 1500],
    ['NOTE_DURATION_STEP_MS', 50],
    ['DEFAULT_MELODY_LENGTH', 5],
    ['MIN_MELODY_LENGTH', 3],
    ['MAX_MELODY_LENGTH', 8],
    ['DEFAULT_VOLUME', 0.5],
    ['MIN_VOLUME', 0],
    ['MAX_VOLUME', 1],
    ['VOLUME_STEP_PERCENT', 5],
    ['PERCENT', 100],
    ['DEFAULT_MAX_INTERVAL', 12],
    ['MAX_INTERVAL_LIMIT', 18],
    ['DEFAULT_SCALE_ID', 'major:do'],
    ['SETTINGS_STORAGE_KEY', 'trumpet-trainer.settings.v1'],
    ['THRESHOLD_STORAGE_KEY', 'trumpet-trainer.thresholdDb'],
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
    ['SYNTH_ENVELOPE_PEAK_GAIN', 1],
    ['SYNTH_VOLUME_RAMP_MS', 20],
    ['SYNTH_ATTACK_MS', 15],
    ['SYNTH_RELEASE_MS', 30],
    ['SYNTH_LOWPASS_HZ', 2000],
    ['SYNTH_LOWPASS_Q', 0.7],
    ['SYNTH_START_DELAY_MS', 50],
  ] as const)('%s = %s', (name, value) => {
    expect((C as Record<string, unknown>)[name]).toBe(value);
  });

  it.each(['MELODY_LENGTH', 'NOTE_DURATION_MS', 'SYNTH_PEAK_GAIN'])('%s has been removed', (name) => {
    expect(name in C).toBe(false);
  });

  it('keeps every exercise default inside its limits and on its step', () => {
    expect(C.DEFAULT_NOTE_DURATION_MS).toBeGreaterThanOrEqual(C.MIN_NOTE_DURATION_MS);
    expect(C.DEFAULT_NOTE_DURATION_MS).toBeLessThanOrEqual(C.MAX_NOTE_DURATION_MS);
    expect((C.DEFAULT_NOTE_DURATION_MS - C.MIN_NOTE_DURATION_MS) % C.NOTE_DURATION_STEP_MS).toBe(0);
    expect((C.MAX_NOTE_DURATION_MS - C.MIN_NOTE_DURATION_MS) % C.NOTE_DURATION_STEP_MS).toBe(0);
    expect(C.DEFAULT_MELODY_LENGTH).toBeGreaterThanOrEqual(C.MIN_MELODY_LENGTH);
    expect(C.DEFAULT_MELODY_LENGTH).toBeLessThanOrEqual(C.MAX_MELODY_LENGTH);
    expect(C.DEFAULT_VOLUME).toBeGreaterThanOrEqual(C.MIN_VOLUME);
    expect(C.DEFAULT_VOLUME).toBeLessThanOrEqual(C.MAX_VOLUME);
    expect((C.DEFAULT_VOLUME * C.PERCENT) % C.VOLUME_STEP_PERCENT).toBe(0);
    expect(C.DEFAULT_MAX_INTERVAL).toBeLessThanOrEqual(C.MAX_INTERVAL_LIMIT);
  });

  it('allows a max interval spanning the whole written range', () => {
    expect(C.MAX_INTERVAL_LIMIT).toBe(C.WRITTEN_MAX_MIDI - C.WRITTEN_MIN_MIDI);
  });

  it('keeps the default threshold inside the meter range', () => {
    expect(C.DEFAULT_THRESHOLD_DB).toBeGreaterThanOrEqual(C.METER_MIN_DB);
    expect(C.DEFAULT_THRESHOLD_DB).toBeLessThanOrEqual(C.METER_MAX_DB);
  });

  it('uses an fftSize of at least 2048 so low notes fit in a frame', () => {
    expect(C.MIC_FFT_SIZE).toBeGreaterThanOrEqual(2048);
  });
});
