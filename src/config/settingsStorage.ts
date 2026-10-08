import { SETTINGS_STORAGE_KEY, THRESHOLD_STORAGE_KEY } from './constants';
import { DEFAULT_SETTINGS, normalizeSettings, parseThreshold, type Settings } from './settings';

/**
 * ADAPTER: the only module that touches `localStorage`. The storage is injected so the app degrades
 * to in-memory behavior when it is missing or blocked. Nothing here throws; validation is in
 * `settings.ts`. Invalid stored data is not rewritten until the next save.
 */

/** `window.localStorage`, or `null` when it is missing or access throws (blocked cookies, sandbox). */
export function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The parsed JSON stored under `key`, or `undefined` when absent, unreadable or not JSON. */
function readJson(storage: Storage | null, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw == null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

function writeJson(storage: Storage | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage blocked: keep working in memory.
  }
}

export function loadSettings(storage: Storage | null): Settings {
  const stored = readJson(storage, SETTINGS_STORAGE_KEY);
  return stored === undefined ? { ...DEFAULT_SETTINGS } : normalizeSettings(stored);
}

export function saveSettings(storage: Storage | null, settings: Settings): void {
  writeJson(storage, SETTINGS_STORAGE_KEY, settings);
}

export function loadThreshold(storage: Storage | null): number {
  return parseThreshold(readJson(storage, THRESHOLD_STORAGE_KEY));
}

export function saveThreshold(storage: Storage | null, thresholdDb: number): void {
  writeJson(storage, THRESHOLD_STORAGE_KEY, thresholdDb);
}
