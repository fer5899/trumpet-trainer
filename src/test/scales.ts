import { getSpecificScale, type ScaleOptionId, type SpecificScale } from '../music/scales';

/** getSpecificScale for tests that need a value: throws on chromatic, group and unknown ids. */
export function requireSpecificScale(id: ScaleOptionId): SpecificScale {
  const scale = getSpecificScale(id);
  if (!scale) throw new Error(`No specific scale with id ${id}`);
  return scale;
}
