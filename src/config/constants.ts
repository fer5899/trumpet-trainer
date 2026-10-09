/**
 * Every tunable number of the app lives here. No magic numbers elsewhere.
 */

// --- Instrument range and transposition (B♭ trumpet) ---
/** Lowest written note: Fa#3. */
export const WRITTEN_MIN_MIDI = 54;
/** Highest written note: Do5. */
export const WRITTEN_MAX_MIDI = 72;
/** concert = written + TRANSPOSITION_SEMITONES. */
export const TRANSPOSITION_SEMITONES = -2;

// --- Tuning reference ---
export const A4_MIDI = 69;
export const A4_HZ = 440;
export const SEMITONES_PER_OCTAVE = 12;
export const CENTS_PER_OCTAVE = 1200;

// --- Exercise ---
/** Silence guard after playback before listening. */
export const LISTEN_GUARD_MS = 250;
/** All-green pause before returning home. */
export const COMPLETE_PAUSE_MS = 1500;

// --- Exercise settings (user-adjustable; defaults and limits) ---
/** Duration of each played note. */
export const DEFAULT_NOTE_DURATION_MS = 1000;
export const MIN_NOTE_DURATION_MS = 250;
export const MAX_NOTE_DURATION_MS = 1500;
export const NOTE_DURATION_STEP_MS = 50;
/** Notes per exercise. */
export const DEFAULT_MELODY_LENGTH = 5;
export const MIN_MELODY_LENGTH = 3;
export const MAX_MELODY_LENGTH = 8;
export const MELODY_LENGTH_STEP = 1;
/** Playback volume = master gain, 0..1 (shown as 0..100 %). */
export const DEFAULT_VOLUME = 0.5;
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 1;
export const VOLUME_STEP_PERCENT = 5;
export const PERCENT = 100;
/** Largest allowed distance (semitones) between consecutive notes. Lower bound = scale's largest step. */
export const DEFAULT_MAX_INTERVAL = 12;
export const MAX_INTERVAL_LIMIT = 18;
export const MAX_INTERVAL_STEP = 1;
export const DEFAULT_SCALE_ID = 'major:do';

// --- Persistence ---
export const SETTINGS_STORAGE_KEY = 'trumpet-trainer.settings.v1';
export const THRESHOLD_STORAGE_KEY = 'trumpet-trainer.thresholdDb';

// --- Success criteria ---
/** Inclusive: abs(cents) <= TOLERANCE_CENTS. */
export const TOLERANCE_CENTS = 25;
/** Required continuous in-tolerance time. */
export const SUSTAIN_MS = 500;

// --- Pitch detection ---
/** Accepted detection range (inclusive). */
export const MIN_DETECT_HZ = 150;
export const MAX_DETECT_HZ = 500;
/** Minimum pitchy clarity. */
export const MIN_CLARITY = 0.9;

// --- Level / threshold (dBFS) ---
/** Level reported for silence or an empty buffer. */
export const LEVEL_FLOOR_DB = -100;
/** Meter and slider range. */
export const METER_MIN_DB = -60;
export const METER_MAX_DB = 0;
/** Initial threshold. */
export const DEFAULT_THRESHOLD_DB = -40;
/** Slider step. */
export const THRESHOLD_STEP_DB = 1;

// --- Microphone ---
/** AnalyserNode fftSize (= frame length in samples). */
export const MIC_FFT_SIZE = 2048;

// --- Synth ---
/** Per-note envelope peak; the master gain carries the volume. */
export const SYNTH_ENVELOPE_PEAK_GAIN = 1;
/** Master-gain ramp when the volume changes during playback. */
export const SYNTH_VOLUME_RAMP_MS = 20;
/** Per-note envelope ramps. */
export const SYNTH_ATTACK_MS = 15;
export const SYNTH_RELEASE_MS = 30;
/** Low-pass filter. */
export const SYNTH_LOWPASS_HZ = 2000;
export const SYNTH_LOWPASS_Q = 0.7;
/** Scheduling lead time. */
export const SYNTH_START_DELAY_MS = 50;
/** Master-gain fade when playback is stopped early. */
export const SYNTH_STOP_FADE_MS = 20;
/** Extra slack for the `done` fallback timer after the last note should have ended. */
export const SYNTH_DONE_FALLBACK_MARGIN_MS = 200;

// --- Unit conversions ---
export const MS_PER_SECOND = 1000;
/** Amplitude ratio → decibels: dB = DB_PER_DECADE * log10(ratio). */
export const DB_PER_DECADE = 20;
