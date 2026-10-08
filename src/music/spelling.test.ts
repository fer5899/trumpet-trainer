import { describe, expect, it } from 'vitest';
import { requireSpecificScale } from '../test/scales';
import { scaleCandidates, type Exercise } from './melody';
import { SPECIFIC_SCALES } from './scales';
import { spellExercise, spellInKey, spellMelody } from './spelling';

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

describe('spellInKey — PRD worked examples', () => {
  it.each([
    ['Fa major', -1, [65, 70, 72], ['Fa4', 'Si♭4', 'Do5']],
    ['Re dorian', 0, [62, 64, 65, 67, 69, 71, 72], ['Re4', 'Mi4', 'Fa4', 'Sol4', 'La4', 'Si4', 'Do5']],
    ['Sol♭ major', -6, [66, 71, 70], ['Sol♭4', 'Do♭5', 'Si♭4']],
    ['Do# major', 7, [60, 65, 61], ['Si#3', 'Mi#4', 'Do#4']],
    ['Fa# major', 6, [65, 66], ['Mi#4', 'Fa#4']],
    ['Do♭ major', -7, [54, 71], ['Sol♭3', 'Do♭5']],
    ['Do major, out of key (e2e only)', 0, [66, 70], ['Fa#4', 'La#4']],
    ['Fa major, out of key (e2e only)', -1, [66], ['Sol♭4']],
  ])('%s (key signature %i): %j → %j', (_label, keySignature, melody, names) => {
    expect(spellInKey(melody, keySignature)).toEqual(names);
  });

  it('spells every note of every scale with the letter-based octave (C4 = 60)', () => {
    for (const scale of SPECIFIC_SCALES) {
      const inKey = scaleCandidates(scale);
      const names = spellInKey(inKey, scale.keySignature);
      // In a key, each letter is used by exactly one pitch class: 7 distinct letters for heptatonics.
      const letters = new Set(names.map((n) => n.replace(/[#♭]?\d+$/, '')));
      expect(letters.size, scale.id).toBe(scale.pitchClasses.length);
      // Accidentals follow the key signature direction.
      for (const n of names) {
        if (scale.keySignature > 0) expect(n).not.toContain('♭');
        if (scale.keySignature < 0) expect(n).not.toContain('#');
        if (scale.keySignature === 0) expect(n).not.toMatch(/[#♭]/);
      }
    }
  });

  it('returns [] for an empty melody', () => {
    expect(spellInKey([], 3)).toEqual([]);
  });
});

describe('spellExercise', () => {
  it('uses the contextual spellMelody for chromatic exercises', () => {
    const exercise: Exercise = { notes: [70, 63, 63, 66, 60], scale: 'chromatic' };
    expect(spellExercise(exercise)).toEqual(spellMelody(exercise.notes));
    expect(spellExercise(exercise)).toEqual(['Si♭4', 'Mi♭4', 'Mi♭4', 'Fa#4', 'Do4']);
  });

  it.each([
    ['major:fa', [65, 70, 72], ['Fa4', 'Si♭4', 'Do5']],
    ['major:fa-sharp', [65, 66, 70], ['Mi#4', 'Fa#4', 'La#4']],
    ['major:sol-flat', [66, 71, 70], ['Sol♭4', 'Do♭5', 'Si♭4']],
    ['dorian:re', [65, 71], ['Fa4', 'Si4']],
  ])('spells a %s exercise in its key signature', (id, notes, names) => {
    const scale = requireSpecificScale(id);
    expect(spellExercise({ notes, scale })).toEqual(spellInKey(notes, scale.keySignature));
    expect(spellExercise({ notes, scale })).toEqual(names);
  });
});
