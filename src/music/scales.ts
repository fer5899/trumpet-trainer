import { SEMITONES_PER_OCTAVE } from '../config/constants';
import { alterSign, FLAT_SIGN, LETTER_PITCH_CLASSES, NOTE_LETTERS, SHARP_SIGN, type Alter } from './notes';

/**
 * Scale catalog (idea §4.1), generated from rules: 9 interval patterns × 15 key signatures.
 * Every specific scale stores the key signature of its parent major scale, which drives spelling.
 */

export type ScaleType =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'
  | 'major-pentatonic'
  | 'minor-pentatonic';
/** 'chromatic' | 'group:<all|type>' | '<type>:<tonic-slug>'. Persisted: ids must stay stable. */
export type ScaleOptionId = string;

export interface SpecificScale {
  /** e.g. 'minor:fa-sharp'. */
  id: ScaleOptionId;
  type: ScaleType;
  /** 'Fa#', 'Si♭', 'Do'. */
  tonicName: string;
  /** −7..+7 (parent major; > 0 sharps, < 0 flats). */
  keySignature: number;
  /** Ascending, 0..11. */
  pitchClasses: readonly number[];
}

export interface ScaleOption {
  id: ScaleOptionId;
  name: string;
  kind: 'chromatic' | 'group' | 'scale';
}

interface ScaleTypeInfo {
  type: ScaleType;
  label: string;
  groupName: string;
  intervals: readonly number[];
  /** Degree (1-based) of the parent major scale this type starts on. */
  parentDegree: number;
}

const SCALE_TYPES: readonly ScaleTypeInfo[] = [
  { type: 'major', label: 'major', groupName: 'All majors', intervals: [0, 2, 4, 5, 7, 9, 11], parentDegree: 1 },
  { type: 'minor', label: 'minor', groupName: 'All natural minors', intervals: [0, 2, 3, 5, 7, 8, 10], parentDegree: 6 },
  { type: 'dorian', label: 'dorian', groupName: 'All dorian', intervals: [0, 2, 3, 5, 7, 9, 10], parentDegree: 2 },
  { type: 'phrygian', label: 'phrygian', groupName: 'All phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], parentDegree: 3 },
  { type: 'lydian', label: 'lydian', groupName: 'All lydian', intervals: [0, 2, 4, 6, 7, 9, 11], parentDegree: 4 },
  { type: 'mixolydian', label: 'mixolydian', groupName: 'All mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], parentDegree: 5 },
  { type: 'locrian', label: 'locrian', groupName: 'All locrian', intervals: [0, 1, 3, 5, 6, 8, 10], parentDegree: 7 },
  {
    type: 'major-pentatonic',
    label: 'major pentatonic',
    groupName: 'All major pentatonics',
    intervals: [0, 2, 4, 7, 9],
    parentDegree: 1,
  },
  {
    type: 'minor-pentatonic',
    label: 'minor pentatonic',
    groupName: 'All minor pentatonics',
    intervals: [0, 3, 5, 7, 10],
    parentDegree: 6,
  },
];

export const CHROMATIC_ID: ScaleOptionId = 'chromatic';
const CHROMATIC_NAME = 'Chromatic';
const GROUP_PREFIX = 'group:';
const GROUP_ALL_ID: ScaleOptionId = `${GROUP_PREFIX}all`;
const GROUP_ALL_NAME = 'All scales';

/** English letter for each solfège letter (search aliases only; display stays solfège). */
const ENGLISH_LETTERS: readonly string[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const LETTER_COUNT = NOTE_LETTERS.length;
/** Letter indexes: sharps Fa Do Sol Re La Mi Si, flats the reverse. */
const SHARP_ORDER: readonly number[] = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER: readonly number[] = [...SHARP_ORDER].reverse();
/** A fifth up spans this many letters (each added sharp moves the major tonic up a fifth). */
const LETTERS_PER_FIFTH = 4;
/** 0, +1 … +7, −1 … −7. */
const KEY_SIGNATURE_ORDER: readonly number[] = [
  ...Array.from({ length: LETTER_COUNT + 1 }, (_, i) => i),
  ...Array.from({ length: LETTER_COUNT }, (_, i) => -(i + 1)),
];

const ALTER_SLUGS: Record<Alter, string> = { [-1]: '-flat', 0: '', 1: '-sharp' };

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Alteration per letter (Do..Si) for a key signature of `keySignature` sharps (> 0) or flats (< 0). */
export function keySignatureAlters(keySignature: number): readonly Alter[] {
  const alters: Alter[] = Array.from({ length: LETTER_COUNT }, () => 0);
  const order = keySignature >= 0 ? SHARP_ORDER : FLAT_ORDER;
  const alter: Alter = keySignature >= 0 ? 1 : -1;
  for (const letter of order.slice(0, Math.abs(keySignature))) alters[letter] = alter;
  return alters;
}

interface CatalogEntry {
  scale: SpecificScale;
  option: ScaleOption;
  /** The option name with the tonic letter in English ("Si♭ major" → "B♭ major"): search alias only. */
  englishName: string;
}

function buildScale(info: ScaleTypeInfo, keySignature: number): CatalogEntry {
  const parentLetter = mod(LETTERS_PER_FIFTH * keySignature, LETTER_COUNT);
  const letter = (parentLetter + info.parentDegree - 1) % LETTER_COUNT;
  const alter = keySignatureAlters(keySignature)[letter];
  const tonicPc = mod(LETTER_PITCH_CLASSES[letter] + alter, SEMITONES_PER_OCTAVE);
  const slug = `${NOTE_LETTERS[letter].toLowerCase()}${ALTER_SLUGS[alter]}`;
  const scale: SpecificScale = {
    id: `${info.type}:${slug}`,
    type: info.type,
    tonicName: `${NOTE_LETTERS[letter]}${alterSign(alter)}`,
    keySignature,
    pitchClasses: info.intervals.map((i) => (tonicPc + i) % SEMITONES_PER_OCTAVE).sort((a, b) => a - b),
  };
  return {
    scale,
    option: { id: scale.id, name: `${scale.tonicName} ${info.label}`, kind: 'scale' },
    englishName: `${ENGLISH_LETTERS[letter]}${alterSign(alter)} ${info.label}`,
  };
}

const TYPE_INFO = Object.fromEntries(SCALE_TYPES.map((info) => [info.type, info])) as Record<ScaleType, ScaleTypeInfo>;

const SCALE_ENTRIES: readonly CatalogEntry[] = SCALE_TYPES.flatMap((info) =>
  KEY_SIGNATURE_ORDER.map((k) => buildScale(info, k)),
);

export const SPECIFIC_SCALES: readonly SpecificScale[] = SCALE_ENTRIES.map((entry) => entry.scale);

/** Chromatic and the groups (they have no English alias). */
const NON_SCALE_OPTIONS: readonly ScaleOption[] = [
  { id: CHROMATIC_ID, name: CHROMATIC_NAME, kind: 'chromatic' },
  { id: GROUP_ALL_ID, name: GROUP_ALL_NAME, kind: 'group' },
  ...SCALE_TYPES.map((info): ScaleOption => ({ id: `${GROUP_PREFIX}${info.type}`, name: info.groupName, kind: 'group' })),
];

export const SCALE_OPTIONS: readonly ScaleOption[] = [...NON_SCALE_OPTIONS, ...SCALE_ENTRIES.map((entry) => entry.option)];

const OPTIONS_BY_ID = new Map(SCALE_OPTIONS.map((option) => [option.id, option]));
const SCALES_BY_ID = new Map(SPECIFIC_SCALES.map((scale) => [scale.id, scale]));

const MEMBERS_BY_ID = new Map<ScaleOptionId, readonly SpecificScale[]>([
  [GROUP_ALL_ID, SPECIFIC_SCALES],
  ...SCALE_TYPES.map(
    (info): [ScaleOptionId, readonly SpecificScale[]] => [
      `${GROUP_PREFIX}${info.type}`,
      SPECIFIC_SCALES.filter((s) => s.type === info.type),
    ],
  ),
  ...SPECIFIC_SCALES.map((scale): [ScaleOptionId, readonly SpecificScale[]] => [scale.id, [scale]]),
]);

export function getScaleOption(id: ScaleOptionId): ScaleOption | undefined {
  return OPTIONS_BY_ID.get(id);
}

/** The specific scale with this id; undefined for chromatic, groups and unknown ids. */
export function getSpecificScale(id: ScaleOptionId): SpecificScale | undefined {
  return SCALES_BY_ID.get(id);
}

export function isScaleOptionId(value: unknown): value is ScaleOptionId {
  return typeof value === 'string' && OPTIONS_BY_ID.has(value);
}

/** Group → its members; scale → [itself]; chromatic → 'chromatic'. Throws on an unknown id. */
export function resolveScaleMembers(id: ScaleOptionId): readonly SpecificScale[] | 'chromatic' {
  if (id === CHROMATIC_ID) return 'chromatic';
  const members = MEMBERS_BY_ID.get(id);
  if (!members) throw new Error(`Unknown scale option id: ${id}`);
  return members;
}

/** Largest gap between neighbouring intervals (ascending), counting the wrap to the octave. */
export function largestStep(intervals: readonly number[]): number {
  return Math.max(
    ...intervals.map((interval, i) =>
      i + 1 < intervals.length ? intervals[i + 1] - interval : intervals[0] + SEMITONES_PER_OCTAVE - interval,
    ),
  );
}

const CHROMATIC_INTERVALS: readonly number[] = Array.from({ length: SEMITONES_PER_OCTAVE }, (_, i) => i);

/** Precomputed at module load: minMaxInterval is called on every settings change and render. */
const MIN_MAX_INTERVAL_BY_ID = new Map<ScaleOptionId, number>([
  [CHROMATIC_ID, largestStep(CHROMATIC_INTERVALS)],
  ...[...MEMBERS_BY_ID].map(([id, members]): [ScaleOptionId, number] => [
    id,
    Math.max(...members.map((s) => largestStep(TYPE_INFO[s.type].intervals))),
  ]),
]);

/** Smallest max interval that keeps every note reachable: the largest step of the scale(s). Throws on an unknown id. */
export function minMaxInterval(id: ScaleOptionId): number {
  const value = MIN_MAX_INTERVAL_BY_ID.get(id);
  if (value === undefined) throw new Error(`Unknown scale option id: ${id}`);
  return value;
}

/** Lowercase, ♭→b, ♯→#, trimmed, whitespace runs collapsed. */
function normalize(text: string): string {
  return text.toLowerCase().replaceAll(FLAT_SIGN, 'b').replaceAll('♯', SHARP_SIGN).trim().replace(/\s+/g, ' ');
}

/** Normalized search keys per option, in SCALE_OPTIONS order: the name, plus the English alias for scales. */
const SEARCH_INDEX: readonly { option: ScaleOption; keys: readonly string[] }[] = [
  ...NON_SCALE_OPTIONS.map((option) => ({ option, keys: [normalize(option.name)] })),
  ...SCALE_ENTRIES.map(({ option, englishName }) => ({ option, keys: [normalize(option.name), normalize(englishName)] })),
];

/** Match quality of a normalized key; lower ranks first. */
const MATCH_TIER = {
  /** The key starts with the query ("do" in "do major"). */
  keyPrefix: 0,
  /** A later word starts with the query ("do" in "re dorian"). */
  wordPrefix: 1,
  /** Anywhere else ("b major" in "bb major"). */
  substring: 2,
} as const;

function matchTier(key: string, needle: string): number | undefined {
  if (key.startsWith(needle)) return MATCH_TIER.keyPrefix;
  if (key.includes(` ${needle}`)) return MATCH_TIER.wordPrefix;
  if (key.includes(needle)) return MATCH_TIER.substring;
  return undefined;
}

/**
 * Options whose name or English alias contains the query (normalized), ranked by their best key:
 * key prefix, then word prefix, then plain substring; SCALE_OPTIONS order within a tier.
 */
export function searchScaleOptions(query: string): readonly ScaleOption[] {
  const needle = normalize(query);
  if (needle === '') return SCALE_OPTIONS;
  const matches = SEARCH_INDEX.flatMap(({ option, keys }) => {
    const tiers = keys.map((key) => matchTier(key, needle)).filter((tier) => tier !== undefined);
    return tiers.length > 0 ? [{ option, tier: Math.min(...tiers) }] : [];
  });
  // Array.prototype.sort is stable: SCALE_OPTIONS order is kept within a tier.
  return matches.sort((a, b) => a.tier - b.tier).map(({ option }) => option);
}
