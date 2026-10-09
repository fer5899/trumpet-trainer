import { MAX_MELODY_LENGTH, MIN_MELODY_LENGTH } from '../config/constants';
import type { Exercise } from '../music/melody';
import { isInWrittenRange, type WrittenMidi } from '../music/notes';
import { getSpecificScale, type ScaleOptionId } from '../music/scales';

const MELODY_PARAM = 'melody';
const INTEGER_PATTERN = /^-?\d+$/;

/**
 * E2E hook: parses `?melody=71,71,71,71,71`. Returns the melody only if it has
 * MIN_MELODY_LENGTH..MAX_MELODY_LENGTH integers, all within the written range; otherwise `null`.
 */
export function parseTestMelody(search: string): WrittenMidi[] | null {
  const raw = new URLSearchParams(search).get(MELODY_PARAM);
  if (raw === null) return null;
  const parts = raw.split(',');
  if (parts.length < MIN_MELODY_LENGTH || parts.length > MAX_MELODY_LENGTH) return null;
  if (!parts.every((p) => INTEGER_PATTERN.test(p))) return null;
  const melody = parts.map(Number);
  return melody.every(isInWrittenRange) ? melody : null;
}

/** Only active in the e2e dev build (`VITE_E2E=true` from `.env.e2e`); production ignores the param. */
export function getTestMelody(): WrittenMidi[] | null {
  return import.meta.env.VITE_E2E === 'true' ? parseTestMelody(window.location.search) : null;
}

/**
 * The `?melody=` notes as an exercise (its length overrides the Melody length setting). A specific
 * scale spells them in its key; chromatic and groups use the contextual spelling, as in the MVP.
 */
export function getTestExercise(scaleId: ScaleOptionId): Exercise | null {
  const notes = getTestMelody();
  if (notes === null) return null;
  return { notes, scale: getSpecificScale(scaleId) ?? 'chromatic' };
}
