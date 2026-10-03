import { MELODY_LENGTH, WRITTEN_MIN_MIDI } from '../config/constants';
import { WRITTEN_RANGE, type WrittenMidi } from './notes';

/** Returns a value in [0, 1). */
export type Rng = () => number;

const MAX_INDEX = WRITTEN_RANGE.length - 1;

/** Random melody: each note independently and uniformly from the 19 written notes. Repeats allowed. */
export function generateMelody(rng: Rng = Math.random, length: number = MELODY_LENGTH): WrittenMidi[] {
  return Array.from(
    { length },
    () => WRITTEN_MIN_MIDI + Math.min(MAX_INDEX, Math.floor(rng() * WRITTEN_RANGE.length)),
  );
}
