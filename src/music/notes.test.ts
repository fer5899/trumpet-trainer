import { describe, expect, it } from 'vitest';
import {
  alterSign,
  FLAT_SIGN,
  LETTER_PITCH_CLASSES,
  NOTE_LETTERS,
  SHARP_SIGN,
  WRITTEN_RANGE,
  centsFrom,
  isInWrittenRange,
  midiToHz,
  noteName,
  writtenToConcert,
} from './notes';

describe('letters and accidental signs', () => {
  it('lists the seven solfège letters and their natural pitch classes', () => {
    expect(NOTE_LETTERS).toEqual(['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si']);
    expect(LETTER_PITCH_CLASSES).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('uses U+0023 for sharp and U+266D for flat', () => {
    expect(SHARP_SIGN).toBe('#');
    expect(FLAT_SIGN).toBe('♭');
  });

  it.each([
    [1, '#'],
    [0, ''],
    [-1, '♭'],
  ] as const)('alterSign(%i) = %j', (alter, sign) => {
    expect(alterSign(alter)).toBe(sign);
  });
});

describe('WRITTEN_RANGE', () => {
  it('has the 19 chromatic notes 54..72 in order', () => {
    expect(WRITTEN_RANGE).toHaveLength(19);
    expect(WRITTEN_RANGE).toEqual(Array.from({ length: 19 }, (_, i) => 54 + i));
  });
});

describe('isInWrittenRange', () => {
  it.each([54, 60, 72])('accepts %s', (m) => {
    expect(isInWrittenRange(m)).toBe(true);
  });
  it.each([53, 73, 60.5, Number.NaN, Number.POSITIVE_INFINITY, -1])('rejects %s', (m) => {
    expect(isInWrittenRange(m)).toBe(false);
  });
});

describe('writtenToConcert', () => {
  it('sounds a whole step below the written note', () => {
    expect(writtenToConcert(54)).toBe(52);
    expect(writtenToConcert(72)).toBe(70);
    expect(writtenToConcert(71)).toBe(69);
  });
});

describe('midiToHz', () => {
  it('maps A4 to exactly 440 Hz', () => {
    expect(midiToHz(69)).toBe(440);
  });
  it('maps concert E3 and B♭4', () => {
    expect(midiToHz(52)).toBeCloseTo(164.81, 2);
    expect(Math.abs(midiToHz(52) - 164.81)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(midiToHz(70) - 466.16)).toBeLessThanOrEqual(0.01);
  });
  it('doubles per octave', () => {
    expect(midiToHz(57)).toBeCloseTo(220, 10);
    expect(midiToHz(81)).toBeCloseTo(880, 10);
  });
});

describe('centsFrom', () => {
  it('is 0 at the target frequency', () => {
    expect(centsFrom(440, 69)).toBeCloseTo(0, 10);
  });
  it('is signed and ±1200 for an octave error', () => {
    expect(centsFrom(220, 69)).toBeCloseTo(-1200, 10);
    expect(centsFrom(880, 69)).toBeCloseTo(1200, 10);
  });
  it('is ±100 for a semitone', () => {
    expect(centsFrom(midiToHz(70), 69)).toBeCloseTo(100, 10);
    expect(centsFrom(midiToHz(68), 69)).toBeCloseTo(-100, 10);
  });
  it('matches the sustain reference examples', () => {
    expect(centsFrom(446.5, 69)).toBeCloseTo(25.39, 1);
    expect(centsFrom(443, 69)).toBeCloseTo(11.76, 1);
  });
});

describe('noteName', () => {
  const sharp = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
  const flat = ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];

  it.each(sharp.map((name, pc) => [60 + pc, `${name}4`] as const))(
    'sharp spelling of %s is %s',
    (m, expected) => {
      expect(noteName(m, 'sharp')).toBe(expected);
    },
  );

  it.each(flat.map((name, pc) => [60 + pc, `${name}4`] as const))(
    'flat spelling of %s is %s',
    (m, expected) => {
      expect(noteName(m, 'flat')).toBe(expected);
    },
  );

  it('matches the PRD examples', () => {
    expect(noteName(60, 'sharp')).toBe('Do4');
    expect(noteName(54, 'flat')).toBe('Sol♭3');
    expect(noteName(72, 'flat')).toBe('Do5');
    expect(noteName(58, 'sharp')).toBe('La#3');
    expect(noteName(54, 'sharp')).toBe('Fa#3');
    expect(noteName(71, 'sharp')).toBe('Si4');
  });

  it('uses U+0023 for sharp and U+266D for flat', () => {
    expect(noteName(61, 'sharp')).toContain('#');
    expect(noteName(61, 'flat')).toContain('♭');
  });

  it('uses octave = floor(m / 12) - 1', () => {
    expect(noteName(59, 'sharp')).toBe('Si3');
    expect(noteName(60, 'sharp')).toBe('Do4');
    expect(noteName(72, 'sharp')).toBe('Do5');
  });
});
