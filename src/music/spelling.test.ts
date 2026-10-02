import { describe, expect, it } from 'vitest';
import { spellMelody } from './spelling';

describe('spellMelody — PRD worked examples', () => {
  it.each([
    [[54, 61, 61, 58, 72], ['Fa#3', 'Do#4', 'Do#4', 'Si♭3', 'Do5']],
    [[56, 56, 56, 56, 56], ['Sol#3', 'Sol#3', 'Sol#3', 'Sol#3', 'Sol#3']],
    [[70, 63, 63, 66, 60], ['Si♭4', 'Mi♭4', 'Mi♭4', 'Fa#4', 'Do4']],
    [[61, 61, 58, 58, 58], ['Re♭4', 'Re♭4', 'Si♭3', 'Si♭3', 'Si♭3']],
    [[60, 61, 60, 59, 58], ['Do4', 'Do#4', 'Do4', 'Si3', 'Si♭3']],
    [[72, 72, 54, 55, 54], ['Do5', 'Do5', 'Sol♭3', 'Sol3', 'Sol♭3']],
    [[66], ['Fa#4']],
  ])('%j → %j', (melody, names) => {
    expect(spellMelody(melody)).toEqual(names);
  });
});

describe('spellMelody — individual rules (IDEA §5.3)', () => {
  it('returns [] for an empty melody', () => {
    expect(spellMelody([])).toEqual([]);
  });

  it('returns one name per note', () => {
    expect(spellMelody([54, 55, 56, 57, 58])).toHaveLength(5);
  });

  it('spells a note reached upwards with a sharp', () => {
    expect(spellMelody([60, 61])[1]).toBe('Do#4');
  });

  it('spells a note reached downwards with a flat', () => {
    expect(spellMelody([62, 61])[1]).toBe('Re♭4');
  });

  it('keeps the previous spelling for a repeated note', () => {
    expect(spellMelody([60, 61, 61])).toEqual(['Do4', 'Do#4', 'Do#4']);
    expect(spellMelody([62, 61, 61])).toEqual(['Re4', 'Re♭4', 'Re♭4']);
  });

  it('keeps a flat spelling across a repeat after a downward step', () => {
    // 63 is reached downwards (flat) and the repeat keeps the flat spelling
    expect(spellMelody([66, 63, 63])).toEqual(['Sol♭4', 'Mi♭4', 'Mi♭4']);
  });

  it('spells the first note by the direction towards the second note', () => {
    expect(spellMelody([61, 63])[0]).toBe('Do#4');
    expect(spellMelody([61, 58])[0]).toBe('Re♭4');
  });

  it('uses the first differing note when the second repeats the first', () => {
    expect(spellMelody([61, 61, 65])[0]).toBe('Do#4');
    expect(spellMelody([61, 61, 55])[0]).toBe('Re♭4');
  });

  it('uses a sharp when the whole melody is the same note', () => {
    expect(spellMelody([58, 58, 58])).toEqual(['La#3', 'La#3', 'La#3']);
  });

  it('never shows an accidental on natural notes', () => {
    const names = spellMelody([64, 65, 64, 60, 72]);
    for (const n of names) {
      expect(n).not.toMatch(/[#♭]/);
    }
  });
});
