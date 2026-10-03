import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTestMelody, parseTestMelody } from './testMelody';

describe('parseTestMelody', () => {
  it.each([
    ['?melody=71,71,71,71,71', [71, 71, 71, 71, 71]],
    ['?melody=54,60,66,70,72', [54, 60, 66, 70, 72]],
    ['?foo=1&melody=60,61,62,63,64', [60, 61, 62, 63, 64]],
    ['melody=60,61,62,63,64', [60, 61, 62, 63, 64]],
  ])('valid %s', (search, expected) => {
    expect(parseTestMelody(search)).toEqual(expected);
  });

  it.each([
    ['missing param', ''],
    ['missing param with others', '?foo=1'],
    ['empty value', '?melody='],
    ['too short', '?melody=60,60,60,60'],
    ['too long', '?melody=60,60,60,60,60,60'],
    ['below range', '?melody=53,60,60,60,60'],
    ['above range', '?melody=60,60,60,60,73'],
    ['non-numeric', '?melody=60,60,abc,60,60'],
    ['decimal', '?melody=60,60,60.5,60,60'],
    ['empty item', '?melody=60,,60,60,60'],
    ['hex', '?melody=0x3c,60,60,60,60'],
  ])('%s → null', (_label, search) => {
    expect(parseTestMelody(search)).toBeNull();
  });
});

describe('getTestMelody', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.replaceState(null, '', '/');
  });

  it('reads the query param when VITE_E2E is "true"', () => {
    vi.stubEnv('VITE_E2E', 'true');
    window.history.replaceState(null, '', '/?melody=71,71,71,71,71');
    expect(getTestMelody()).toEqual([71, 71, 71, 71, 71]);
  });

  it.each([undefined, 'false', ''])('ignores the query param when VITE_E2E is %s', (value) => {
    if (value === undefined) vi.stubEnv('VITE_E2E', undefined as unknown as string);
    else vi.stubEnv('VITE_E2E', value);
    window.history.replaceState(null, '', '/?melody=71,71,71,71,71');
    expect(getTestMelody()).toBeNull();
  });
});
