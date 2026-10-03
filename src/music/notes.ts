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

const PITCH_CLASS_NAMES: Record<Accidental, readonly string[]> = {
  sharp: ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'],
  flat: ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'],
};

/** Latin solfège name with octave (C4 = MIDI 60). Naturals ignore `accidental`. */
export function noteName(m: WrittenMidi, accidental: Accidental): string {
  const pitchClass = m % SEMITONES_PER_OCTAVE;
  const octave = Math.floor(m / SEMITONES_PER_OCTAVE) - 1;
  return `${PITCH_CLASS_NAMES[accidental][pitchClass]}${octave}`;
}
