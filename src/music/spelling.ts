import { SEMITONES_PER_OCTAVE } from '../config/constants';
import type { Exercise } from './melody';
import { alterSign, LETTER_PITCH_CLASSES, NOTE_LETTERS, noteName, type Accidental, type Alter, type Melody } from './notes';
import { keySignatureAlters } from './scales';

/** Accidental for the first note: direction towards the first note that differs; sharp if none. */
function firstAccidental(melody: Melody): Accidental {
  const first = melody[0];
  const firstDifferent = melody.find((m) => m !== first);
  if (firstDifferent === undefined) return 'sharp';
  return firstDifferent > first ? 'sharp' : 'flat';
}

/**
 * Contextual spelling (IDEA §5.3): sharp when the melody goes up, flat when it goes down,
 * a repeated note keeps the previous spelling. Naturals never show an accidental.
 */
export function spellMelody(melody: Melody): string[] {
  if (melody.length === 0) return [];

  const accidentals: Accidental[] = [firstAccidental(melody)];
  for (let i = 1; i < melody.length; i += 1) {
    const current = melody[i];
    const previous = melody[i - 1];
    if (current > previous) accidentals.push('sharp');
    else if (current < previous) accidentals.push('flat');
    else accidentals.push(accidentals[i - 1]);
  }

  return melody.map((m, i) => noteName(m, accidentals[i]));
}

interface SpelledPitchClass {
  letter: number;
  alter: Alter;
}

/** Pitch class → the letter and alteration the key signature gives it (7 entries). */
function keyPitchClassMap(keySignature: number): Map<number, SpelledPitchClass> {
  const alters = keySignatureAlters(keySignature);
  return new Map(
    alters.map((alter, letter): [number, SpelledPitchClass] => [
      (LETTER_PITCH_CLASSES[letter] + alter + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE,
      { letter, alter },
    ]),
  );
}

/**
 * Spelling in a key (idea §4.1): each note takes the letter and accidental of the key signature,
 * with the letter-based octave (Si#3 = 60, Do♭5 = 71). A pitch class outside the key (only reachable
 * through the e2e `?melody=` hook) falls back to sharps for sharp/no key signatures, flats otherwise.
 */
export function spellInKey(melody: Melody, keySignature: number): string[] {
  const map = keyPitchClassMap(keySignature);
  const fallback: Accidental = keySignature >= 0 ? 'sharp' : 'flat';
  return melody.map((m) => {
    const spelled = map.get(m % SEMITONES_PER_OCTAVE);
    if (!spelled) return noteName(m, fallback);
    const octave = Math.floor((m - spelled.alter) / SEMITONES_PER_OCTAVE) - 1;
    return `${NOTE_LETTERS[spelled.letter]}${alterSign(spelled.alter)}${octave}`;
  });
}

/** Chromatic exercises keep the contextual rule; scale exercises are spelled in their key. */
export function spellExercise(exercise: Exercise): string[] {
  return exercise.scale === 'chromatic'
    ? spellMelody(exercise.notes)
    : spellInKey(exercise.notes, exercise.scale.keySignature);
}
