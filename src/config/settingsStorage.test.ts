import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeStorage, createThrowingStorage } from '../test/fakeStorage';
import { DEFAULT_THRESHOLD_DB, SETTINGS_STORAGE_KEY, THRESHOLD_STORAGE_KEY } from './constants';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { getBrowserStorage, loadSettings, loadThreshold, saveSettings, saveThreshold } from './settingsStorage';

const CUSTOM: Settings = { noteDurationMs: 750, melodyLength: 8, volume: 0.8, maxInterval: 3, scaleId: 'group:all' };

describe('fake storage helpers', () => {
  it('createFakeStorage implements the Storage interface over a Map', () => {
    const storage = createFakeStorage({ a: '1' });
    expect(storage.length).toBe(1);
    expect(storage.getItem('a')).toBe('1');
    expect(storage.getItem('missing')).toBeNull();
    storage.setItem('b', '2');
    expect(storage.key(1)).toBe('b');
    expect(storage.key(5)).toBeNull();
    storage.removeItem('a');
    expect(storage.length).toBe(1);
    storage.clear();
    expect(storage.length).toBe(0);
  });

  it('createThrowingStorage throws a SecurityError from every method', () => {
    const storage = createThrowingStorage();
    for (const call of [
      () => storage.getItem('a'),
      () => storage.setItem('a', '1'),
      () => storage.removeItem('a'),
      () => storage.key(0),
      () => storage.clear(),
      () => storage.length,
    ]) {
      expect(call).toThrow(expect.objectContaining({ name: 'SecurityError' }));
    }
  });
});

describe('settings', () => {
  it('round-trips through a storage under the versioned key', () => {
    const storage = createFakeStorage();
    saveSettings(storage, CUSTOM);
    expect(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')).toEqual(CUSTOM);
    expect(loadSettings(storage)).toEqual(CUSTOM);
  });

  it.each<[string, Storage | null]>([
    ['null storage', null],
    ['a missing key', createFakeStorage()],
    ['invalid JSON', createFakeStorage({ [SETTINGS_STORAGE_KEY]: '{oops' })],
    ['JSON null', createFakeStorage({ [SETTINGS_STORAGE_KEY]: 'null' })],
    ['a throwing storage', createThrowingStorage()],
  ])('loads DEFAULT_SETTINGS from %s without throwing', (_label, storage) => {
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('normalizes stored data field by field and does not rewrite it', () => {
    const raw = JSON.stringify({ noteDurationMs: 750, volume: 2, scaleId: 'major:fa' });
    const storage = createFakeStorage({ [SETTINGS_STORAGE_KEY]: raw });
    expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, noteDurationMs: 750, scaleId: 'major:fa' });
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).toBe(raw);
  });

  it('saving to null or a throwing storage does not throw', () => {
    expect(() => saveSettings(null, CUSTOM)).not.toThrow();
    expect(() => saveSettings(createThrowingStorage(), CUSTOM)).not.toThrow();
  });

  it('swallows quota errors on save', () => {
    const storage = createFakeStorage();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => saveSettings(storage, CUSTOM)).not.toThrow();
  });
});

describe('threshold', () => {
  it('round-trips as a JSON number under its own key', () => {
    const storage = createFakeStorage();
    saveThreshold(storage, -35);
    expect(storage.getItem(THRESHOLD_STORAGE_KEY)).toBe('-35');
    expect(loadThreshold(storage)).toBe(-35);
  });

  it.each<[string, Storage | null]>([
    ['null storage', null],
    ['a missing key', createFakeStorage()],
    ['invalid JSON', createFakeStorage({ [THRESHOLD_STORAGE_KEY]: '{oops' })],
    ['a JSON string', createFakeStorage({ [THRESHOLD_STORAGE_KEY]: '"abc"' })],
    ['a numeric string', createFakeStorage({ [THRESHOLD_STORAGE_KEY]: '"-35"' })],
    ['out of range', createFakeStorage({ [THRESHOLD_STORAGE_KEY]: '-61' })],
    ['a throwing storage', createThrowingStorage()],
  ])('loads DEFAULT_THRESHOLD_DB from %s without throwing', (_label, storage) => {
    expect(loadThreshold(storage)).toBe(DEFAULT_THRESHOLD_DB);
  });

  it('saving to null or a throwing storage does not throw', () => {
    expect(() => saveThreshold(null, -35)).not.toThrow();
    expect(() => saveThreshold(createThrowingStorage(), -35)).not.toThrow();
  });

  it('is independent of the settings key', () => {
    const storage = createFakeStorage();
    saveThreshold(storage, -20);
    saveSettings(storage, CUSTOM);
    expect(loadThreshold(storage)).toBe(-20);
    expect(loadSettings(storage)).toEqual(CUSTOM);
  });
});

describe('getBrowserStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns window.localStorage when available', () => {
    expect(getBrowserStorage()).toBe(window.localStorage);
  });

  it('returns null when accessing window.localStorage throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(getBrowserStorage()).toBeNull();
  });
});
