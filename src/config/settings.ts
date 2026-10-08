import { CHROMATIC_ID, isScaleOptionId, minMaxInterval, type ScaleOptionId } from '../music/scales';
import {
  DEFAULT_MAX_INTERVAL,
  DEFAULT_MELODY_LENGTH,
  DEFAULT_NOTE_DURATION_MS,
  DEFAULT_SCALE_ID,
  DEFAULT_THRESHOLD_DB,
  DEFAULT_VOLUME,
  MAX_INTERVAL_LIMIT,
  MAX_MELODY_LENGTH,
  MAX_NOTE_DURATION_MS,
  MAX_VOLUME,
  METER_MAX_DB,
  METER_MIN_DB,
  MIN_MELODY_LENGTH,
  MIN_NOTE_DURATION_MS,
  MIN_VOLUME,
  NOTE_DURATION_STEP_MS,
  PERCENT,
  THRESHOLD_STEP_DB,
  VOLUME_STEP_PERCENT,
} from './constants';

/** User-adjustable exercise settings (pure value object; all rules live in this module). */
export interface Settings {
  /** MIN..MAX_NOTE_DURATION_MS, a multiple of NOTE_DURATION_STEP_MS from the minimum. */
  noteDurationMs: number;
  /** Integer MIN..MAX_MELODY_LENGTH. */
  melodyLength: number;
  /** MIN_VOLUME..MAX_VOLUME (master gain), a whole multiple of VOLUME_STEP_PERCENT / PERCENT. */
  volume: number;
  /** Integer minMaxInterval(scaleId)..MAX_INTERVAL_LIMIT. */
  maxInterval: number;
  /** A SCALE_OPTIONS id. */
  scaleId: ScaleOptionId;
}

/** 'all' on Home; 'training' resets only what the Training screen shows. */
export type ResetScope = 'all' | 'training';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  noteDurationMs: DEFAULT_NOTE_DURATION_MS,
  melodyLength: DEFAULT_MELODY_LENGTH,
  volume: DEFAULT_VOLUME,
  maxInterval: DEFAULT_MAX_INTERVAL,
  scaleId: DEFAULT_SCALE_ID,
});

/** Selects a scale, raising (never lowering) maxInterval to the scale's minimum. */
export function selectScale(settings: Settings, scaleId: ScaleOptionId): Settings {
  return { ...settings, scaleId, maxInterval: Math.max(settings.maxInterval, minMaxInterval(scaleId)) };
}

export function resetSettings(settings: Settings, scope: ResetScope): Settings {
  if (scope === 'all') return { ...DEFAULT_SETTINGS };
  return { ...settings, noteDurationMs: DEFAULT_NOTE_DURATION_MS, volume: DEFAULT_VOLUME };
}

const isNumberInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const isIntegerInRange = (value: unknown, min: number, max: number): value is number =>
  isNumberInRange(value, min, max) && Number.isInteger(value);

const isValidNoteDuration = (value: unknown): value is number =>
  isNumberInRange(value, MIN_NOTE_DURATION_MS, MAX_NOTE_DURATION_MS) &&
  (value - MIN_NOTE_DURATION_MS) % NOTE_DURATION_STEP_MS === 0;

/**
 * On a VOLUME_STEP_PERCENT step: a whole percent (exactly percent / PERCENT, the value the slider
 * stores, so 0.35 passes although 0.35 × 100 is not exactly 35) that is a multiple of the step.
 */
const isValidVolume = (value: unknown): value is number => {
  if (!isNumberInRange(value, MIN_VOLUME, MAX_VOLUME)) return false;
  const percent = Math.round(value * PERCENT);
  return percent / PERCENT === value && percent % VOLUME_STEP_PERCENT === 0;
};

/**
 * Validates data of unknown origin (storage) field by field: each invalid field falls back to its
 * own default, unknown keys are dropped, and maxInterval is raised to the scale minimum.
 */
export function normalizeSettings(value: unknown): Settings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ...DEFAULT_SETTINGS };
  const raw = value as Partial<Record<keyof Settings, unknown>>;
  const normalized: Settings = {
    noteDurationMs: isValidNoteDuration(raw.noteDurationMs) ? raw.noteDurationMs : DEFAULT_SETTINGS.noteDurationMs,
    melodyLength: isIntegerInRange(raw.melodyLength, MIN_MELODY_LENGTH, MAX_MELODY_LENGTH)
      ? raw.melodyLength
      : DEFAULT_SETTINGS.melodyLength,
    volume: isValidVolume(raw.volume) ? raw.volume : DEFAULT_SETTINGS.volume,
    maxInterval: isIntegerInRange(raw.maxInterval, minMaxInterval(CHROMATIC_ID), MAX_INTERVAL_LIMIT)
      ? raw.maxInterval
      : DEFAULT_SETTINGS.maxInterval,
    scaleId: isScaleOptionId(raw.scaleId) ? raw.scaleId : DEFAULT_SETTINGS.scaleId,
  };
  return selectScale(normalized, normalized.scaleId);
}

/** A finite number within the meter range on a THRESHOLD_STEP_DB step, else DEFAULT_THRESHOLD_DB. */
export function parseThreshold(value: unknown): number {
  return isNumberInRange(value, METER_MIN_DB, METER_MAX_DB) && (value - METER_MIN_DB) % THRESHOLD_STEP_DB === 0
    ? value
    : DEFAULT_THRESHOLD_DB;
}
