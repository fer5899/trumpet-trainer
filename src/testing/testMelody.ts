import { MELODY_LENGTH } from '../config/constants';
import { isInWrittenRange, type WrittenMidi } from '../music/notes';

const MELODY_PARAM = 'melody';
const INTEGER_PATTERN = /^-?\d+$/;

/**
 * E2E hook: parses `?melody=71,71,71,71,71`. Returns the melody only if it has exactly
 * MELODY_LENGTH integers, all within the written range; otherwise `null`.
 */
export function parseTestMelody(search: string): WrittenMidi[] | null {
  const raw = new URLSearchParams(search).get(MELODY_PARAM);
  if (raw === null) return null;
  const parts = raw.split(',');
  if (parts.length !== MELODY_LENGTH || !parts.every((p) => INTEGER_PATTERN.test(p))) return null;
  const melody = parts.map(Number);
  return melody.every(isInWrittenRange) ? melody : null;
}

/** Only active in the e2e dev build (`VITE_E2E=true` from `.env.e2e`); production ignores the param. */
export function getTestMelody(): WrittenMidi[] | null {
  return import.meta.env.VITE_E2E === 'true' ? parseTestMelody(window.location.search) : null;
}
