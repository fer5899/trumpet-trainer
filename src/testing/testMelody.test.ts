import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireSpecificScale } from '../test/scales';
import { spellExercise } from '../music/spelling';
import { getTestExercise, getTestMelody, parseTestMelody } from './testMelody';

describe('parseTestMelody', () => {
  it.each([
    ['?melody=71,71,71,71,71', [71, 71, 71, 71, 71]],
    ['?melody=54,60,66,70,72', [54, 60, 66, 70, 72]],
    ['?foo=1&melody=60,61,62,63,64', [60, 61, 62, 63, 64]],
    ['melody=60,61,62,63,64', [60, 61, 62, 63, 64]],
    ['?melody=60,62,64', [60, 62, 64]],
    ['?melody=71,71,71,71,71,71,71,71', [71, 71, 71, 71, 71, 71, 71, 71]],
  ])('valid %s', (search, expected) => {
    expect(parseTestMelody(search)).toEqual(expected);
  });

  it.each([
    ['missing param', ''],
    ['missing param with others', '?foo=1'],
    ['empty value', '?melody='],
    ['too short (2 notes)', '?melody=60,60'],
    ['too long (9 notes)', '?melody=60,60,60,60,60,60,60,60,60'],
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

describe('getTestExercise', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_E2E', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.replaceState(null, '', '/');
  });

  it('returns null without a test melody', () => {
    expect(getTestExercise('major:do')).toBeNull();
  });

  it('returns null when the e2e build flag is off', () => {
    vi.stubEnv('VITE_E2E', 'false');
    window.history.replaceState(null, '', '/?melody=71,71,71');
    expect(getTestExercise('major:do')).toBeNull();
  });

  it('uses the selected specific scale (Do major: 71 → Si4, 60 → Do4)', () => {
    window.history.replaceState(null, '', '/?melody=71,71,71,60,60');
    const exercise = getTestExercise('major:do');
    expect(exercise).toEqual({ notes: [71, 71, 71, 60, 60], scale: requireSpecificScale('major:do') });
    expect(spellExercise(exercise!)).toEqual(['Si4', 'Si4', 'Si4', 'Do4', 'Do4']);
  });

  it('spells in the selected key (Fa major: 70 → Si♭4)', () => {
    window.history.replaceState(null, '', '/?melody=65,70,72');
    const exercise = getTestExercise('major:fa');
    expect(exercise?.scale).toBe(requireSpecificScale('major:fa'));
    expect(spellExercise(exercise!)).toEqual(['Fa4', 'Si♭4', 'Do5']);
  });

  it.each(['group:all', 'group:major', 'chromatic'])('%s → chromatic (contextual spelling)', (id) => {
    window.history.replaceState(null, '', '/?melody=54,61,61,58,72');
    const exercise = getTestExercise(id);
    expect(exercise).toEqual({ notes: [54, 61, 61, 58, 72], scale: 'chromatic' });
    expect(spellExercise(exercise!)).toEqual(['Fa#3', 'Do#4', 'Do#4', 'Si♭3', 'Do5']);
  });
});
