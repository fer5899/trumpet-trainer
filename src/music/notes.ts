import {
  A4_HZ,
  A4_MIDI,
  CENTS_PER_OCTAVE,
  SEMITONES_PER_OCTAVE,
  TRANSPOSITION_SEMITONES,
  WRITTEN_MAX_MIDI,
  WRITTEN_MIN_MIDI,
} from '../config/constants';

/** B♭-trumpet written pitch, WRITTEN_MIN_MIDI..WRITTEN_MAX_MIDI. */
export type WrittenMidi = number;
/** Sounding pitch = written + TRANSPOSITION_SEMITONES. */
export type ConcertMidi = number;
export type Melody = readonly WrittenMidi[];
export type Accidental = 'sharp' | 'flat';

export const WRITTEN_RANGE: readonly WrittenMidi[] = Object.freeze(
  Array.from({ length: WRITTEN_MAX_MIDI - WRITTEN_MIN_MIDI + 1 }, (_, i) => WRITTEN_MIN_MIDI + i),
);

export function isInWrittenRange(m: number): boolean {
  return Number.isInteger(m) && m >= WRITTEN_MIN_MIDI && m <= WRITTEN_MAX_MIDI;
}

export function writtenToConcert(w: WrittenMidi): ConcertMidi {
  return w + TRANSPOSITION_SEMITONES;
}

export function midiToHz(m: number): number {
  return A4_HZ * 2 ** ((m - A4_MIDI) / SEMITONES_PER_OCTAVE);
}

/** Signed distance in cents from `hz` to the target MIDI note (octave errors count: ±1200). */
export function centsFrom(hz: number, targetMidi: number): number {
  return CENTS_PER_OCTAVE * Math.log2(hz / midiToHz(targetMidi));
}

/** Alteration of a letter: −1 flat, 0 natural, +1 sharp. */
export type Alter = -1 | 0 | 1;

/** Latin solfège letters, Do..Si, and their natural pitch classes. */
export const NOTE_LETTERS: readonly string[] = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
export const LETTER_PITCH_CLASSES: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

export const SHARP_SIGN = '#';
export const FLAT_SIGN = '♭';
const ALTER_SIGNS: Record<Alter, string> = { [-1]: FLAT_SIGN, 0: '', 1: SHARP_SIGN };

/** Signed alteration sign: '#', '♭' or ''. */
export function alterSign(alter: Alter): string {
  return ALTER_SIGNS[alter];
}

/** Name of each pitch class 0..11: the natural letter, else the letter below + '#' or above + '♭'. */
function pitchClassNames(accidental: Accidental): readonly string[] {
  const alter: Alter = accidental === 'sharp' ? 1 : -1;
  return Array.from({ length: SEMITONES_PER_OCTAVE }, (_, pc) => {
    const natural = LETTER_PITCH_CLASSES.indexOf(pc);
    if (natural >= 0) return NOTE_LETTERS[natural];
    const letter = LETTER_PITCH_CLASSES.indexOf(pc - alter);
    return `${NOTE_LETTERS[letter]}${alterSign(alter)}`;
  });
}

const PITCH_CLASS_NAMES: Record<Accidental, readonly string[]> = {
  sharp: pitchClassNames('sharp'),
  flat: pitchClassNames('flat'),
};

/** Latin solfège name with octave (C4 = MIDI 60). Naturals ignore `accidental`. */
export function noteName(m: WrittenMidi, accidental: Accidental): string {
  const pitchClass = m % SEMITONES_PER_OCTAVE;
  const octave = Math.floor(m / SEMITONES_PER_OCTAVE) - 1;
  return `${PITCH_CLASS_NAMES[accidental][pitchClass]}${octave}`;
}
