import { describe, expect, it } from 'vitest';
import { isScaleOptionId, minMaxInterval, SCALE_OPTIONS } from '../music/scales';
import { DEFAULT_THRESHOLD_DB, PERCENT, VOLUME_STEP_PERCENT } from './constants';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  parseThreshold,
  percentToVolume,
  resetSettings,
  selectScale,
  type Settings,
  volumeToPercent,
} from './settings';

const CUSTOM: Settings = { noteDurationMs: 750, melodyLength: 8, volume: 0.8, maxInterval: 5, scaleId: 'minor:mi' };

describe('DEFAULT_SETTINGS', () => {
  it('is 1000 ms, 5 notes, volume 0.5, max interval 12, Do major', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      noteDurationMs: 1000,
      melodyLength: 5,
      volume: 0.5,
      maxInterval: 12,
      scaleId: 'major:do',
    });
  });

  it('is frozen', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
  });

  it('uses a scale id from the catalog (an unknown id would make normalizeSettings throw)', () => {
    expect(isScaleOptionId(DEFAULT_SETTINGS.scaleId)).toBe(true);
  });

  it('has a max interval that reaches every note of the default scale', () => {
    expect(DEFAULT_SETTINGS.maxInterval).toBeGreaterThanOrEqual(minMaxInterval(DEFAULT_SETTINGS.scaleId));
  });
});

describe('selectScale', () => {
  it.each([
    ['raises 1 → 2 for a heptatonic scale', 1, 'major:fa', 2],
    ['raises 2 → 3 for a pentatonic scale', 2, 'major-pentatonic:do', 3],
    ['raises 2 → 3 for group:all', 2, 'group:all', 3],
    ['raises 1 → 3 for a pentatonic group', 1, 'group:minor-pentatonic', 3],
    ['keeps 3 for a pentatonic scale', 3, 'minor-pentatonic:la', 3],
    ['never lowers 12 for chromatic', 12, 'chromatic', 12],
    ['never lowers 2 for chromatic', 2, 'chromatic', 2],
    ['keeps 18 for a heptatonic scale', 18, 'locrian:si', 18],
  ])('%s', (_label, maxInterval, scaleId, expected) => {
    const result = selectScale({ ...CUSTOM, maxInterval }, scaleId);
    expect(result).toEqual({ ...CUSTOM, scaleId, maxInterval: expected });
  });

  it('returns a new object and leaves the input untouched', () => {
    const input = { ...CUSTOM };
    const result = selectScale(input, 'group:major');
    expect(result).not.toBe(input);
    expect(input).toEqual(CUSTOM);
  });
});

describe('resetSettings', () => {
  it("'all' returns a copy of the defaults", () => {
    const result = resetSettings(CUSTOM, 'all');
    expect(result).toEqual(DEFAULT_SETTINGS);
    expect(result).not.toBe(DEFAULT_SETTINGS);
  });

  it("'training' resets only note duration and volume", () => {
    expect(resetSettings(CUSTOM, 'training')).toEqual({ ...CUSTOM, noteDurationMs: 1000, volume: 0.5 });
  });
});

describe('normalizeSettings', () => {
  it.each([[null], [undefined], ['x'], [42], [true], [[]], [[1, 2, 3]], [() => undefined], [{}]])(
    '%j → DEFAULT_SETTINGS',
    (value) => {
      expect(normalizeSettings(value)).toEqual(DEFAULT_SETTINGS);
    },
  );

  it.each<[string, unknown, Partial<Settings>]>([
    [
      'keeps valid fields, replaces an out-of-range volume',
      { noteDurationMs: 750, volume: 2, scaleId: 'major:fa' },
      { noteDurationMs: 750, volume: 0.5, scaleId: 'major:fa' },
    ],
    ['off-step note duration', { noteDurationMs: 760 }, { noteDurationMs: 1000 }],
    ['string note duration', { noteDurationMs: '750' }, { noteDurationMs: 1000 }],
    ['note duration below range', { noteDurationMs: 200 }, { noteDurationMs: 1000 }],
    ['note duration above range', { noteDurationMs: 1550 }, { noteDurationMs: 1000 }],
    ['note duration at the minimum', { noteDurationMs: 250 }, { noteDurationMs: 250 }],
    ['note duration at the maximum', { noteDurationMs: 1500 }, { noteDurationMs: 1500 }],
    ['melody length above range', { melodyLength: 9 }, { melodyLength: 5 }],
    ['melody length below range', { melodyLength: 2 }, { melodyLength: 5 }],
    ['non-integer melody length', { melodyLength: 4.5 }, { melodyLength: 5 }],
    ['melody length 3', { melodyLength: 3 }, { melodyLength: 3 }],
    ['melody length 8', { melodyLength: 8 }, { melodyLength: 8 }],
    ['volume 0', { volume: 0 }, { volume: 0 }],
    ['volume 1', { volume: 1 }, { volume: 1 }],
    ['negative volume', { volume: -0.1 }, { volume: 0.5 }],
    ['NaN volume', { volume: NaN }, { volume: 0.5 }],
    ['Infinity volume', { volume: Infinity }, { volume: 0.5 }],
    ['on-step volume 0.35 (5 % steps, despite 0.35 × 100 ≠ 35 in floating point)', { volume: 0.35 }, { volume: 0.35 }],
    ['on-step volume 0.05', { volume: 0.05 }, { volume: 0.05 }],
    ['on-step volume 0.95', { volume: 0.95 }, { volume: 0.95 }],
    ['off-step volume 0.333', { volume: 0.333 }, { volume: 0.5 }],
    ['off-step volume 0.52 (whole percent, not a 5 % step)', { volume: 0.52 }, { volume: 0.5 }],
    ['off-step volume 0.351', { volume: 0.351 }, { volume: 0.5 }],
    [
      'max interval raised to the scale minimum',
      { maxInterval: 2, scaleId: 'group:major-pentatonic' },
      { maxInterval: 3, scaleId: 'group:major-pentatonic' },
    ],
    ['max interval 1 with chromatic', { maxInterval: 1, scaleId: 'chromatic' }, { maxInterval: 1, scaleId: 'chromatic' }],
    ['max interval 1 with the default scale is raised to 2', { maxInterval: 1 }, { maxInterval: 2 }],
    ['max interval 0', { maxInterval: 0 }, { maxInterval: 12 }],
    ['max interval 19', { maxInterval: 19 }, { maxInterval: 12 }],
    ['non-integer max interval', { maxInterval: 5.5 }, { maxInterval: 12 }],
    ['max interval 18', { maxInterval: 18 }, { maxInterval: 18 }],
    ['unknown scale id', { scaleId: 'major:xx' }, { scaleId: 'major:do' }],
    ['non-string scale id', { scaleId: 7 }, { scaleId: 'major:do' }],
    ['ignores unknown extra keys', { melodyLength: 6, extra: 'x', thresholdDb: -20 }, { melodyLength: 6 }],
  ])('%s', (_label, value, expected) => {
    expect(normalizeSettings(value)).toEqual({ ...DEFAULT_SETTINGS, ...expected });
  });

  it('returns a valid settings value unchanged (deep-equal, extra keys dropped)', () => {
    expect(normalizeSettings({ ...CUSTOM })).toEqual(CUSTOM);
    expect(Object.keys(normalizeSettings({ ...CUSTOM, junk: 1 })).sort()).toEqual(Object.keys(CUSTOM).sort());
  });

  it('accepts every volume step', () => {
    for (let percent = 0; percent <= PERCENT; percent += VOLUME_STEP_PERCENT) {
      expect(normalizeSettings({ volume: percent / PERCENT }).volume, String(percent)).toBe(percent / PERCENT);
    }
  });

  it('accepts every scale option id', () => {
    for (const { id } of SCALE_OPTIONS) {
      expect(normalizeSettings({ scaleId: id }).scaleId).toBe(id);
    }
  });
});

describe('parseThreshold', () => {
  it.each([[-60], [-59], [-40], [-35], [-1], [0]])('%s → itself', (value) => {
    expect(parseThreshold(value)).toBe(value);
  });

  it.each([[NaN], [Infinity], [-Infinity], ['-35'], [-61], [1], [-35.5], [-0.5], [-59.9], [null], [undefined], [{}]])(
    '%j → DEFAULT_THRESHOLD_DB',
    (value) => {
      expect(parseThreshold(value)).toBe(DEFAULT_THRESHOLD_DB);
    },
  );
});

describe('volumeToPercent / percentToVolume', () => {
  it.each([
    [0, 0],
    [0.05, 5],
    [0.35, 35],
    [0.5, 50],
    [1, 100],
  ])('volume %s ↔ %s %%', (volume, percent) => {
    expect(volumeToPercent(volume)).toBe(percent);
    expect(percentToVolume(percent)).toBe(volume);
  });

  it('volumeToPercent rounds to a whole percent', () => {
    expect(volumeToPercent(0.354)).toBe(35);
  });

  it('every slider step round-trips to a valid stored volume', () => {
    for (let percent = 0; percent <= PERCENT; percent += VOLUME_STEP_PERCENT) {
      const volume = percentToVolume(percent);
      expect(volumeToPercent(volume)).toBe(percent);
      expect(normalizeSettings({ ...DEFAULT_SETTINGS, volume }).volume).toBe(volume);
    }
  });
});
