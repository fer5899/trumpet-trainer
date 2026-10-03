import { noteName, type Accidental, type Melody } from './notes';

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
