import { describe, expect, it } from 'vitest';
import { requireSpecificScale } from '../test/scales';
import {
  CHROMATIC_ID,
  getScaleOption,
  getSpecificScale,
  isScaleOptionId,
  keySignatureAlters,
  largestStep,
  minMaxInterval,
  resolveScaleMembers,
  SCALE_OPTIONS,
  searchScaleOptions,
  SPECIFIC_SCALES,
  type ScaleType,
} from './scales';

const KEY_SIGNATURE_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7];

const TYPE_ORDER: readonly ScaleType[] = [
  'major',
  'minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
  'major-pentatonic',
  'minor-pentatonic',
];

const LABELS: Record<ScaleType, string> = {
  major: 'major',
  minor: 'minor',
  dorian: 'dorian',
  phrygian: 'phrygian',
  lydian: 'lydian',
  mixolydian: 'mixolydian',
  locrian: 'locrian',
  'major-pentatonic': 'major pentatonic',
  'minor-pentatonic': 'minor pentatonic',
};

const INTERVALS: Record<ScaleType, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  'major-pentatonic': [0, 2, 4, 7, 9],
  'minor-pentatonic': [0, 3, 5, 7, 10],
};

const MAJOR_TONICS = 'Do Sol Re La Mi Si Fa# Do# Fa Si♭ Mi♭ La♭ Re♭ Sol♭ Do♭';
const MINOR_TONICS = 'La Mi Si Fa# Do# Sol# Re# La# Re Sol Do Fa Si♭ Mi♭ La♭';

/** The PRD tonic table, columns in KEY_SIGNATURE_ORDER. */
const TONICS: Record<ScaleType, string> = {
  major: MAJOR_TONICS,
  'major-pentatonic': MAJOR_TONICS,
  minor: MINOR_TONICS,
  'minor-pentatonic': MINOR_TONICS,
  dorian: 'Re La Mi Si Fa# Do# Sol# Re# Sol Do Fa Si♭ Mi♭ La♭ Re♭',
  phrygian: 'Mi Si Fa# Do# Sol# Re# La# Mi# La Re Sol Do Fa Si♭ Mi♭',
  lydian: 'Fa Do Sol Re La Mi Si Fa# Si♭ Mi♭ La♭ Re♭ Sol♭ Do♭ Fa♭',
  mixolydian: 'Sol Re La Mi Si Fa# Do# Sol# Do Fa Si♭ Mi♭ La♭ Re♭ Sol♭',
  locrian: 'Si Fa# Do# Sol# Re# La# Mi# Si# Mi La Re Sol Do Fa Si♭',
};

const GROUP_NAMES = [
  'All scales',
  'All majors',
  'All natural minors',
  'All dorian',
  'All phrygian',
  'All lydian',
  'All mixolydian',
  'All locrian',
  'All major pentatonics',
  'All minor pentatonics',
];

const SOLFEGE_TO_PC: Record<string, number> = { Do: 0, Re: 2, Mi: 4, Fa: 5, Sol: 7, La: 9, Si: 11 };

function tonicPitchClass(tonicName: string): number {
  const match = /^(Do|Re|Mi|Fa|Sol|La|Si)(#|♭)?$/.exec(tonicName);
  if (!match) throw new Error(`bad tonic ${tonicName}`);
  const alter = match[2] === '#' ? 1 : match[2] === '♭' ? -1 : 0;
  return (SOLFEGE_TO_PC[match[1]] + alter + 12) % 12;
}

const names = (options: readonly { name: string }[]) => options.map((o) => o.name);

describe('keySignatureAlters', () => {
  it.each([
    [0, [0, 0, 0, 0, 0, 0, 0]],
    [1, [0, 0, 0, 1, 0, 0, 0]],
    [2, [1, 0, 0, 1, 0, 0, 0]],
    [3, [1, 0, 0, 1, 1, 0, 0]],
    [4, [1, 1, 0, 1, 1, 0, 0]],
    [5, [1, 1, 0, 1, 1, 1, 0]],
    [6, [1, 1, 1, 1, 1, 1, 0]],
    [7, [1, 1, 1, 1, 1, 1, 1]],
    [-1, [0, 0, 0, 0, 0, 0, -1]],
    [-2, [0, 0, -1, 0, 0, 0, -1]],
    [-3, [0, 0, -1, 0, 0, -1, -1]],
    [-4, [0, -1, -1, 0, 0, -1, -1]],
    [-5, [0, -1, -1, 0, -1, -1, -1]],
    [-6, [-1, -1, -1, 0, -1, -1, -1]],
    [-7, [-1, -1, -1, -1, -1, -1, -1]],
  ])('keySignatureAlters(%i) = %j (Do Re Mi Fa Sol La Si)', (k, expected) => {
    expect(keySignatureAlters(k)).toEqual(expected);
  });
});

describe('SPECIFIC_SCALES', () => {
  it('has 9 types × 15 key signatures = 135 scales, by type then key-signature order', () => {
    expect(SPECIFIC_SCALES).toHaveLength(135);
    TYPE_ORDER.forEach((type, t) => {
      KEY_SIGNATURE_ORDER.forEach((k, j) => {
        const scale = SPECIFIC_SCALES[t * 15 + j];
        expect(scale.type).toBe(type);
        expect(scale.keySignature).toBe(k);
      });
    });
  });

  it.each(TYPE_ORDER)('%s: the 15 tonic names match the tonic table in key-signature order', (type) => {
    const tonics = SPECIFIC_SCALES.filter((s) => s.type === type);
    expect(tonics.map((s) => s.tonicName)).toEqual(TONICS[type].split(' '));
    expect(tonics.map((s) => s.keySignature)).toEqual(KEY_SIGNATURE_ORDER);
  });

  it('pitch classes = tonic + intervals mod 12, ascending', () => {
    for (const scale of SPECIFIC_SCALES) {
      const tonic = tonicPitchClass(scale.tonicName);
      const expected = INTERVALS[scale.type].map((i) => (tonic + i) % 12).sort((a, b) => a - b);
      expect(scale.pitchClasses, scale.id).toEqual(expected);
    }
  });

  it.each([
    ['major:fa', [0, 2, 4, 5, 7, 9, 10]],
    ['major:do', [0, 2, 4, 5, 7, 9, 11]],
    ['dorian:re', [0, 2, 4, 5, 7, 9, 11]],
    ['lydian:fa-flat', requireSpecificScale('lydian:mi').pitchClasses],
    ['locrian:si-sharp', requireSpecificScale('locrian:do').pitchClasses],
    ['minor:mi-flat', requireSpecificScale('major:sol-flat').pitchClasses],
    ['major-pentatonic:do', [0, 2, 4, 7, 9]],
    ['minor-pentatonic:la', [0, 2, 4, 7, 9]],
  ])('%s pitch classes = %j', (id, expected) => {
    expect(requireSpecificScale(id).pitchClasses).toEqual(expected);
  });

  it.each([
    ['dorian:re', 0],
    ['minor:mi-flat', -6],
    ['lydian:fa-flat', -7],
    ['locrian:si-sharp', 7],
    ['major:fa-sharp', 6],
    ['major:sol-flat', -6],
    ['minor-pentatonic:la', 0],
  ])('%s has key signature %i', (id, k) => {
    expect(requireSpecificScale(id).keySignature).toBe(k);
  });

  it('ids are <type>:<letter>[-sharp|-flat] and names are "<tonic> <label>"', () => {
    for (const scale of SPECIFIC_SCALES) {
      const slug = scale.tonicName.toLowerCase().replace('#', '-sharp').replace('♭', '-flat');
      expect(scale.id).toBe(`${scale.type}:${slug}`);
      expect(getScaleOption(scale.id)).toEqual({
        id: scale.id,
        name: `${scale.tonicName} ${LABELS[scale.type]}`,
        kind: 'scale',
      });
    }
  });
});

describe('SCALE_OPTIONS', () => {
  it('has 146 unique ids: chromatic, 10 groups, then the 135 scales in order', () => {
    expect(SCALE_OPTIONS).toHaveLength(146);
    expect(new Set(SCALE_OPTIONS.map((o) => o.id)).size).toBe(146);
    expect(SCALE_OPTIONS[0]).toEqual({ id: CHROMATIC_ID, name: 'Chromatic', kind: 'chromatic' });
    expect(CHROMATIC_ID).toBe('chromatic');
    expect(SCALE_OPTIONS.slice(1, 11)).toEqual([
      { id: 'group:all', name: 'All scales', kind: 'group' },
      ...TYPE_ORDER.map((type, i) => ({ id: `group:${type}`, name: GROUP_NAMES[i + 1], kind: 'group' })),
    ]);
    expect(SCALE_OPTIONS.slice(11).map((o) => o.id)).toEqual(SPECIFIC_SCALES.map((s) => s.id));
    expect(SCALE_OPTIONS.slice(11).every((o) => o.kind === 'scale')).toBe(true);
  });

  it.each([
    ['major:do', 'Do major'],
    ['minor:mi', 'Mi minor'],
    ['dorian:re', 'Re dorian'],
    ['major-pentatonic:do', 'Do major pentatonic'],
    ['minor-pentatonic:la', 'La minor pentatonic'],
    ['minor:fa-sharp', 'Fa# minor'],
    ['major:si-flat', 'Si♭ major'],
    ['lydian:fa-flat', 'Fa♭ lydian'],
    ['group:major-pentatonic', 'All major pentatonics'],
  ])('getScaleOption(%s).name = %s', (id, name) => {
    expect(getScaleOption(id)?.name).toBe(name);
  });

  it('getScaleOption returns undefined for unknown ids', () => {
    expect(getScaleOption('major:xx')).toBeUndefined();
  });
});

describe('getSpecificScale', () => {
  it.each(SPECIFIC_SCALES.map((s) => [s.id, s] as const))('%s → that scale', (id, scale) => {
    expect(getSpecificScale(id)).toBe(scale);
  });

  it.each([['major:xx'], [''], [CHROMATIC_ID], ['group:all'], ['group:major'], ['toString'], ['__proto__'], ['constructor']])(
    '%j → undefined',
    (id) => {
      expect(getSpecificScale(id)).toBeUndefined();
    },
  );
});

describe('isScaleOptionId', () => {
  it.each(SCALE_OPTIONS.map((o) => o.id))('accepts %s', (id) => {
    expect(isScaleOptionId(id)).toBe(true);
  });

  it.each([['major:xx'], [''], ['group:'], ['Major:do'], [42], [null], [undefined], [{}], [['major:do']]])(
    'rejects %j',
    (value) => {
      expect(isScaleOptionId(value)).toBe(false);
    },
  );
});

describe('resolveScaleMembers', () => {
  it('chromatic → "chromatic"', () => {
    expect(resolveScaleMembers(CHROMATIC_ID)).toBe('chromatic');
  });

  it('group:all → all 135 scales in order', () => {
    expect(resolveScaleMembers('group:all')).toEqual(SPECIFIC_SCALES);
  });

  it.each(TYPE_ORDER)('group:%s → that type’s 15 scales in key-signature order', (type) => {
    const members = resolveScaleMembers(`group:${type}`);
    expect(members).toEqual(SPECIFIC_SCALES.filter((s) => s.type === type));
    expect(members).toHaveLength(15);
  });

  it('a specific scale → [itself]', () => {
    expect(resolveScaleMembers('minor:fa-sharp')).toEqual([requireSpecificScale('minor:fa-sharp')]);
  });

  it('throws on an unknown id', () => {
    expect(() => resolveScaleMembers('major:xx')).toThrow();
  });
});

describe('largestStep and minMaxInterval', () => {
  it.each(TYPE_ORDER)('largestStep(%s intervals)', (type) => {
    expect(largestStep(INTERVALS[type])).toBe(type.endsWith('pentatonic') ? 3 : 2);
  });

  it.each([
    [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 1],
    [[0, 7], 7],
    [[0, 5], 7],
    [[0], 12],
  ])('largestStep(%j) = %i (wrap to the octave counts)', (intervals, expected) => {
    expect(largestStep(intervals)).toBe(expected);
  });

  it.each([
    ['chromatic', 1],
    ['major:do', 2],
    ['locrian:si-sharp', 2],
    ['group:major', 2],
    ['group:dorian', 2],
    ['major-pentatonic:do', 3],
    ['minor-pentatonic:la', 3],
    ['group:major-pentatonic', 3],
    ['group:minor-pentatonic', 3],
    ['group:all', 3],
  ])('minMaxInterval(%s) = %i', (id, expected) => {
    expect(minMaxInterval(id)).toBe(expected);
  });

  it('every option: the largest step over its members (1 for chromatic)', () => {
    for (const { id } of SCALE_OPTIONS) {
      const members = resolveScaleMembers(id);
      const expected = members === 'chromatic' ? 1 : Math.max(...members.map((s) => largestStep(INTERVALS[s.type])));
      expect(minMaxInterval(id), id).toBe(expected);
    }
  });

  it.each([['major:xx'], [''], ['toString'], ['__proto__']])('minMaxInterval(%j) throws', (id) => {
    expect(() => minMaxInterval(id)).toThrow();
  });
});

describe('searchScaleOptions', () => {
  const ALL_SI_FLAT = TYPE_ORDER.map((type) => `Si♭ ${LABELS[type]}`);

  it.each([
    ['sib', ALL_SI_FLAT],
    ['bb major', ['Si♭ major', 'Si♭ major pentatonic']],
    ['F# Dorian', ['Fa# dorian']],
    ['re♭ major', ['Re♭ major', 'Re♭ major pentatonic']],
    [
      'pent',
      [
        'All major pentatonics',
        'All minor pentatonics',
        ...MAJOR_TONICS.split(' ').map((t) => `${t} major pentatonic`),
        ...MINOR_TONICS.split(' ').map((t) => `${t} minor pentatonic`),
      ],
    ],
    ['chrom', ['Chromatic']],
    ['all', GROUP_NAMES],
    ['xyz', []],
  ])('%s → the documented options in order', (query, expected) => {
    expect(names(searchScaleOptions(query))).toEqual(expected);
  });

  it('"pent" returns 32 options', () => {
    expect(searchScaleOptions('pent')).toHaveLength(32);
  });

  it.each([[''], ['   '], ['\t']])('an empty query %j returns every option in order', (query) => {
    expect(searchScaleOptions(query)).toEqual(SCALE_OPTIONS);
  });

  it.each([
    ['SI♭ MAJOR', 'Si♭ major'],
    ['  si♭   major ', 'Si♭ major'],
    ['fa♯ dorian', 'Fa# dorian'],
    ['f♯ dorian', 'Fa# dorian'],
    ['Bb Major', 'Si♭ major'],
    ['c major', 'Do major'],
    ['g mixolydian', 'Sol mixolydian'],
    ['e♭ minor', 'Mi♭ minor'],
  ])('%j finds %s (case, whitespace, ♭/♯, English letters)', (query, expected) => {
    expect(names(searchScaleOptions(query))).toContain(expected);
  });

  describe('ranking: whole-key prefix, then word prefix, then substring; SCALE_OPTIONS order within a tier', () => {
    it('"b major": B major (prefix) before B♭/E♭… major (substring of "bb major", "eb major"…)', () => {
      expect(names(searchScaleOptions('b major'))).toEqual([
        'Si major',
        'Si major pentatonic',
        'Si♭ major',
        'Mi♭ major',
        'La♭ major',
        'Re♭ major',
        'Sol♭ major',
        'Do♭ major',
        'Si♭ major pentatonic',
        'Mi♭ major pentatonic',
        'La♭ major pentatonic',
        'Re♭ major pentatonic',
        'Sol♭ major pentatonic',
        'Do♭ major pentatonic',
      ]);
    });

    it('"do": Do-tonic options (name prefix) before dorian ones (word prefix)', () => {
      const results = names(searchScaleOptions('do'));
      const doTonic = results.filter((n) => /^Do[#♭]? /.test(n));
      expect(results.slice(0, doTonic.length)).toEqual(doTonic);
      expect(doTonic).toEqual([
        ...TYPE_ORDER.flatMap((type) =>
          SPECIFIC_SCALES.filter((s) => s.type === type && s.tonicName.startsWith('Do')).map(
            (s) => `${s.tonicName} ${LABELS[type]}`,
          ),
        ),
      ]);
      expect(results.slice(doTonic.length)).toEqual([
        'All dorian',
        ...TONICS.dorian
          .split(' ')
          .filter((t) => !t.startsWith('Do'))
          .map((t) => `${t} dorian`),
      ]);
    });

    it('"minor": "All natural minors" and every minor scale are word-prefix matches, in catalog order', () => {
      const results = names(searchScaleOptions('minor'));
      expect(results[0]).toBe('All natural minors');
      expect(results[1]).toBe('All minor pentatonics');
      expect(results.slice(2)).toEqual([
        ...MINOR_TONICS.split(' ').map((t) => `${t} minor`),
        ...MINOR_TONICS.split(' ').map((t) => `${t} minor pentatonic`),
      ]);
    });
  });

  it('finds every scale by its English name (tonic letter in English, same accidental and label)', () => {
    const ENGLISH: Record<string, string> = { Do: 'C', Re: 'D', Mi: 'E', Fa: 'F', Sol: 'G', La: 'A', Si: 'B' };
    for (const scale of SPECIFIC_SCALES) {
      const english = scale.tonicName.replace(/^(Do|Re|Mi|Fa|Sol|La|Si)/, (l) => ENGLISH[l]);
      expect(searchScaleOptions(`${english} ${LABELS[scale.type]}`).map((o) => o.id), scale.id).toContain(scale.id);
    }
  });

  it('matches English aliases only on the tonic (display stays solfège)', () => {
    const results = searchScaleOptions('c major');
    expect(names(results)).toEqual(['Do major', 'Do major pentatonic']);
  });
});
