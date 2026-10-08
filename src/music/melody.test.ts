import { describe, expect, it, vi } from 'vitest';
import { MAX_INTERVAL_LIMIT, MAX_MELODY_LENGTH, MIN_MELODY_LENGTH } from '../config/constants';
import { requireSpecificScale } from '../test/scales';
import { seededRng } from '../test/signals';
import { generateExercise, pickIndex, scaleCandidates, type Rng } from './melody';
import { isInWrittenRange, WRITTEN_RANGE } from './notes';
import { CHROMATIC_ID, minMaxInterval, resolveScaleMembers, SCALE_OPTIONS, type SpecificScale } from './scales';
import { spellExercise } from './spelling';

const constantRng = (value: number): Rng => () => value;

function sequenceRng(values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('sequenceRng: out of values');
    return values[i++];
  };
}

const ALMOST_ONE = 1 - Number.EPSILON;

describe('pickIndex', () => {
  it.each([
    [0, 1, 0],
    [0, 19, 0],
    [0.5, 4, 2],
    [0.05, 19, 0],
    [0.06, 19, 1],
    [0.9999, 19, 18],
    [ALMOST_ONE, 19, 18],
    [ALMOST_ONE, 1, 0],
    [1, 5, 4],
  ])('rng %s over %i → %i', (value, n, expected) => {
    expect(pickIndex(constantRng(value), n)).toBe(expected);
  });

  it('consumes exactly one rng call', () => {
    const rng = vi.fn(constantRng(0.3));
    pickIndex(rng, 7);
    expect(rng).toHaveBeenCalledTimes(1);
  });
});

describe('scaleCandidates', () => {
  it('chromatic → all 19 written notes', () => {
    expect(scaleCandidates('chromatic')).toEqual([...WRITTEN_RANGE]);
    expect(scaleCandidates('chromatic')).toHaveLength(19);
  });

  it.each([
    ['major:do', [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72]],
    ['major:fa', [55, 57, 58, 60, 62, 64, 65, 67, 69, 70, 72]],
    ['major-pentatonic:do', [55, 57, 60, 62, 64, 67, 69, 72]],
    ['major:fa-sharp', [54, 56, 58, 59, 61, 63, 65, 66, 68, 70, 71]],
  ])('%s → %j', (id, expected) => {
    expect(scaleCandidates(requireSpecificScale(id))).toEqual(expected);
  });
});

describe('generateExercise — worked examples', () => {
  it('Do major, max 12, length 3, rng 0 / 0.5 / 0.99 → [55, 62, 72] spelled Sol3 Re4 Do5', () => {
    const rng = vi.fn(sequenceRng([0, 0.5, 0.99]));
    const exercise = generateExercise(rng, { length: 3, maxInterval: 12, scaleId: 'major:do' });
    expect(exercise).toEqual({ notes: [55, 62, 72], scale: requireSpecificScale('major:do') });
    expect(spellExercise(exercise)).toEqual(['Sol3', 'Re4', 'Do5']);
    expect(rng).toHaveBeenCalledTimes(3);
  });

  it('group:major: the first rng call picks the member (0.6 → index 9 = Si♭ major)', () => {
    const rng = vi.fn(sequenceRng([0.6, 0, 0, 0]));
    const exercise = generateExercise(rng, { length: 3, maxInterval: 12, scaleId: 'group:major' });
    expect(exercise.scale).toBe(requireSpecificScale('major:si-flat'));
    expect(exercise.scale).toBe((resolveScaleMembers('group:major') as readonly SpecificScale[])[9]);
    // Si♭ major candidates start at 55 (Sol3): every pick of index 0 stays there.
    expect(exercise.notes).toEqual([55, 55, 55]);
    expect(rng).toHaveBeenCalledTimes(4);
  });

  it('chromatic with max interval 18 reproduces the MVP mapping (uniform over the 19 notes)', () => {
    const rng = vi.fn(sequenceRng([0, 0.5, 0.9999, 0.05, 0.06]));
    const exercise = generateExercise(rng, { length: 5, maxInterval: MAX_INTERVAL_LIMIT, scaleId: CHROMATIC_ID });
    expect(exercise).toEqual({ notes: [54, 63, 72, 54, 55], scale: 'chromatic' });
    expect(rng).toHaveBeenCalledTimes(5);
  });

  it('restricts each next note to candidates within maxInterval of the previous one', () => {
    // Chromatic, max 2: from 54 the reachable notes are 54, 55, 56 → index 2 = 56, then 54..58 → last = 58.
    const exercise = generateExercise(sequenceRng([0, ALMOST_ONE, ALMOST_ONE]), {
      length: 3,
      maxInterval: 2,
      scaleId: CHROMATIC_ID,
    });
    expect(exercise.notes).toEqual([54, 56, 58]);
  });

  it('never indexes out of bounds when rng returns 0.999…', () => {
    for (const option of SCALE_OPTIONS) {
      const exercise = generateExercise(constantRng(ALMOST_ONE), {
        length: MAX_MELODY_LENGTH,
        maxInterval: minMaxInterval(option.id),
        scaleId: option.id,
      });
      expect(exercise.notes.every((n) => n !== undefined && isInWrittenRange(n)), option.id).toBe(true);
    }
  });
});

describe('generateExercise — rng call contract', () => {
  it.each(SCALE_OPTIONS.map((o) => [o.id, o.kind] as const))('%s (%s)', (scaleId, kind) => {
    const rng = vi.fn(constantRng(0.4));
    generateExercise(rng, { length: 6, maxInterval: 12, scaleId });
    expect(rng).toHaveBeenCalledTimes(kind === 'group' ? 7 : 6);
  });

  it('a specific scale returns itself and chromatic returns "chromatic"', () => {
    const options = { length: 3, maxInterval: 12 };
    expect(generateExercise(constantRng(0.4), { ...options, scaleId: 'minor:fa-sharp' }).scale).toBe(
      requireSpecificScale('minor:fa-sharp'),
    );
    expect(generateExercise(constantRng(0.4), { ...options, scaleId: CHROMATIC_ID }).scale).toBe('chromatic');
  });

  it('throws on an unknown scale id', () => {
    expect(() => generateExercise(constantRng(0), { length: 3, maxInterval: 12, scaleId: 'major:xx' })).toThrow();
  });
});

describe('generateExercise — seeded properties', () => {
  const lengths = Array.from({ length: MAX_MELODY_LENGTH - MIN_MELODY_LENGTH + 1 }, (_, i) => MIN_MELODY_LENGTH + i);

  it.each(SCALE_OPTIONS.map((o) => [o.id]))(
    '%s: every length and max interval yields in-range, in-scale notes within maxInterval',
    (scaleId) => {
      const members = resolveScaleMembers(scaleId);
      const violations: string[] = [];
      let runs = 0;
      let seed = 1;
      for (const length of lengths) {
        for (let maxInterval = minMaxInterval(scaleId); maxInterval <= MAX_INTERVAL_LIMIT; maxInterval += 1) {
          const { notes, scale } = generateExercise(seededRng(seed++), { length, maxInterval, scaleId });
          runs += 1;
          const where = `length ${length}, max ${maxInterval}: ${notes.join(',')}`;
          if (notes.length !== length) violations.push(`${where}: wrong length`);
          if (members === 'chromatic' ? scale !== 'chromatic' : scale === 'chromatic' || !members.includes(scale)) {
            violations.push(`${where}: scale not a member`);
          }
          notes.forEach((note, i) => {
            if (!isInWrittenRange(note)) violations.push(`${where}: ${note} out of range`);
            if (scale !== 'chromatic' && !scale.pitchClasses.includes(note % 12)) {
              violations.push(`${where}: ${note} not in ${scale.id}`);
            }
            if (i > 0 && Math.abs(note - notes[i - 1]) > maxInterval) violations.push(`${where}: leap at ${i}`);
          });
        }
      }
      expect(runs).toBe(lengths.length * (MAX_INTERVAL_LIMIT - minMaxInterval(scaleId) + 1));
      expect(violations).toEqual([]);
    },
  );

  it('reaches every candidate note of the scale over many seeded runs', () => {
    const scale = requireSpecificScale('major-pentatonic:do');
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed += 1) {
      for (const n of generateExercise(seededRng(seed), { length: 8, maxInterval: 3, scaleId: scale.id }).notes) {
        seen.add(n);
      }
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(scaleCandidates(scale));
  });
});
