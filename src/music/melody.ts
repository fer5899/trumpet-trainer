import { SEMITONES_PER_OCTAVE } from '../config/constants';
import { WRITTEN_RANGE, type Melody, type WrittenMidi } from './notes';
import { resolveScaleMembers, type ScaleOptionId, type SpecificScale } from './scales';

/** Returns a value in [0, 1). */
export type Rng = () => number;

/** A generated exercise: its notes and the scale they were drawn from (a group's picked member). */
export interface Exercise {
  notes: Melody;
  scale: SpecificScale | 'chromatic';
}

export interface ExerciseOptions {
  length: number;
  /** Largest allowed distance (semitones) between consecutive notes. */
  maxInterval: number;
  scaleId: ScaleOptionId;
}

/** Written-range notes (WRITTEN_RANGE, ascending) whose pitch class is in the scale; chromatic → all 19. */
export function scaleCandidates(scale: SpecificScale | 'chromatic'): WrittenMidi[] {
  if (scale === 'chromatic') return [...WRITTEN_RANGE];
  return WRITTEN_RANGE.filter((m) => scale.pitchClasses.includes(m % SEMITONES_PER_OCTAVE));
}

/** Uniform index in 0..n−1; consumes exactly one rng() call and never overflows if rng() returns 1. */
export function pickIndex(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}

/**
 * Random walk over the scale's written-range notes. The rng call order is a contract:
 * a group first picks one member (one call), then every note takes exactly one call.
 * Each next note is uniform over the candidates within `maxInterval` of the previous one,
 * which always include the previous note (repeats allowed), so a candidate always exists.
 */
export function generateExercise(rng: Rng, { length, maxInterval, scaleId }: ExerciseOptions): Exercise {
  const members = resolveScaleMembers(scaleId);
  const scale =
    members === 'chromatic' ? members : members.length > 1 ? members[pickIndex(rng, members.length)] : members[0];
  const candidates = scaleCandidates(scale);

  const notes: WrittenMidi[] = [];
  for (let i = 0; i < length; i += 1) {
    const previous = notes.at(-1);
    const reachable =
      previous === undefined ? candidates : candidates.filter((c) => Math.abs(c - previous) <= maxInterval);
    notes.push(reachable[pickIndex(rng, reachable.length)]);
  }
  return { notes, scale };
}
