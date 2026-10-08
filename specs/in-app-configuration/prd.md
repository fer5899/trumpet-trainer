# In-app Configuration - Product Requirements Document (Part 1 of 2)

> **Source of truth for product behavior:** `specs/in-app-configuration/idea.md` (referred to as "the idea", sections as §N). The MVP specs (`specs/create-mvp/prd.md`, `prd2.md`) describe the code this feature changes.
> **This PRD is split in two files:**
> - `prd.md` (this file): overview, problem, goals, implementation decisions, constants, music domain (scale catalog, spelling in key, exercise generator), settings model + storage adapter, synth / `AudioServices` / fake changes, acceptance criteria for these parts.
> - `prd2.md`: training hook changes, UI (gear button, `SettingsDialog`, `ScaleCombobox`, `App` wiring, `TrainingScreen`, note-box layout), UI mockups, `?melody=` hook, e2e, testing decisions, acceptance criteria for those parts, out of scope, `CLAUDE.md` updates.
>
> **Brownfield note:** the MVP is implemented. Paths marked **(new)** do not exist yet; every other path exists and is modified.

## Overview

A **Settings** panel, opened from a gear button on every screen, lets the player change note duration, playback volume, melody length, maximum interval between consecutive notes and the scale (or scale group) melodies are drawn from. Changes apply live and are saved to `localStorage` together with the microphone threshold, so the app opens the next time exactly as the player left it.

## Problem Statement

The MVP has one user setting (the microphone threshold) and it is lost on every reload. Tempo, volume, melody length and the note pool are compile-time constants: every player gets 5 chromatic notes at 500 ms with jumps of up to 18 semitones. That is too hard for beginners (atonal, wide leaps, fast) and gives advanced players no way to practise specific keys or modes. Without runtime settings the trainer can't adapt to the player's level, and without persistence every visit starts with re-tuning the threshold.

## Goals

- Every in-scope setting (idea §4) can be changed from both screens where allowed, in **≤ 2 clicks** from either screen (gear → control).
- Settings and the mic threshold survive a reload in 100 % of cases where `localStorage` works; missing, blocked or corrupt storage never breaks the app (defaults are used).
- With a scale selected, **every** generated note is in the scale and in the written range, and every consecutive pair is at most `maxInterval` semitones apart (property-tested over seeded runs).
- All 146 selector options (1 chromatic + 10 groups + 135 scales) are reachable by typing, with solfège or English names, `b`/`#` for ♭/♯.
- Up to 8 note boxes fit without horizontal scrolling at a 320 px viewport.
- No regression: all existing unit, component and e2e tests pass after being updated for the new defaults.

## Target Users

- Beginner trumpet players: slower playback, short melodies, small intervals, a simple key (default Do major).
- Intermediate/advanced players: practise a specific key, mode or pentatonic, or random keys of one type (groups), longer melodies, wider leaps.
- Every user: a remembered threshold and a remembered volume suited to their device.

## Feature Map

| # | Feature area | Defined in |
|---|---|---|
| 1 | Constants changes | prd.md |
| 2 | Music domain: scale catalog + search, spelling in key, exercise generator, `Exercise` type | prd.md |
| 3 | Settings model (pure) + storage adapter (thin) | prd.md |
| 4 | Synth volume, `AudioServices.playMelody` options, fake services | prd.md |
| 5 | Training hook and reducer changes | prd2.md |
| 6 | UI: gear button, `SettingsDialog`, `ScaleCombobox`, `App`, `TrainingScreen`, note-box layout, mockups | prd2.md |
| 7 | `?melody=` hook, e2e specs, testing decisions, docs | prd2.md |

## Implementation Decisions

- **A modal dialog, not a screen.** The panel overlays the current screen instead of being a third screen, so opening it never unmounts the training session (the microphone, the reducer state and the progress stay alive). A native modal dialog gives focus trapping, Esc handling, a backdrop and focus return for free, without a UI library.
- **Live apply, no Save button.** Every control is a single value with an obvious effect; applying immediately removes a confirm step, lets the player hear a volume change while the melody plays, and makes persistence a side effect of each change rather than a separate action. "Reset to defaults" is the only undo.
- **Nothing pauses while the panel is open.** Pausing would need new reducer phases and would interfere with the guard/sustain timing. Listening continues behind the dialog; a note may turn green while the panel is open, which is harmless.
- **Settings as one pure value object.** All rules (ranges, steps, the scale ↔ max-interval minimum, reset scopes, validation of loaded data) live in pure functions over a plain object, so they are table-tested without React or storage. The UI only renders and forwards new values.
- **Validate on load, field by field.** Stored data comes from an earlier version, another tab or manual tampering. Each field falls back to its own default when invalid, so one bad field does not discard the others; the result always satisfies the same invariants as a value produced by the UI.
- **Storage behind an injected seam.** `localStorage` can be missing or throw (private mode, blocked cookies, quota). One thin adapter does all access inside `try/catch` and receives the storage object as a parameter, so the app degrades to in-memory behavior and tests never touch the real storage.
- **Versioned storage key.** The settings key carries a version so a future incompatible shape can be introduced without misreading old data. The threshold uses its own key because it is not part of the panel and has its own reset rules.
- **Volume on the master gain.** Per-note envelopes are scheduled ahead of time and can't be changed once scheduled; the master gain is a single live parameter. Putting the volume there makes a mid-melody change audible immediately, and a short ramp avoids clicks.
- **Note duration is read at playback start.** Changing the tempo of an already scheduled melody would desynchronise the schedule and the "playback finished" signal; the new duration applies from the next playback (Repeat).
- **Scale catalog generated from rules, not typed by hand.** The 135 specific scales follow from 9 interval patterns × 15 key signatures and the degree of the parent major scale each mode starts on. Generating them avoids typos in 135 entries and makes the spelling of every tonic (including Fa♭, Mi#, Si#) fall out of the key signature.
- **Both enharmonic spellings are separate options.** Fa# major and Sol♭ major sound the same but read differently; trumpet players practise reading in both. The key signature is stored per scale and drives note naming.
- **Spelling by key signature.** A scale melody is read in its key, so names come from the key signature instead of melody direction; chromatic melodies keep the MVP's contextual rule because they have no key.
- **Random walk generator.** Restricting each next note to candidates within the max interval of the previous one, chosen uniformly, is the simplest rule that honours the interval limit while keeping every scale note reachable. Repeats stay allowed because the previous note is always a candidate, which also guarantees that a candidate always exists.
- **An exercise carries its scale.** A group picks one scale per exercise; keeping the picked scale with the notes means Repeat replays the same melody, names are spelled in the scale that was actually used, and the stored setting stays the group.
- **Max interval minimum follows the scale.** A max interval smaller than the scale's largest step would leave notes with no reachable neighbour. Raising it automatically on scale selection (and on load) keeps the invariant without error messages.
- **Searchable combobox, no dependency.** ~146 options are too many for a plain select on mobile; a filtered text field with a listbox is accessible (ARIA combobox pattern), testable in jsdom and needs no new package. English letter aliases help players who learned C-D-E names without changing what is displayed.

## Technical Requirements — Constants (`src/config/constants.ts`)

**Remove** `MELODY_LENGTH`, `NOTE_DURATION_MS`, `SYNTH_PEAK_GAIN`. **Add** (all named exports, grouped under the existing comments):

```ts
// --- Exercise settings (user-adjustable; defaults and limits) ---
export const DEFAULT_NOTE_DURATION_MS = 1000;
export const MIN_NOTE_DURATION_MS = 250;
export const MAX_NOTE_DURATION_MS = 1500;
export const NOTE_DURATION_STEP_MS = 50;
export const DEFAULT_MELODY_LENGTH = 5;
export const MIN_MELODY_LENGTH = 3;
export const MAX_MELODY_LENGTH = 8;
/** Playback volume = master gain, 0..1 (shown as 0..100 %). */
export const DEFAULT_VOLUME = 0.5;
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 1;
export const VOLUME_STEP_PERCENT = 5;
export const PERCENT = 100;
/** Largest allowed distance (semitones) between consecutive notes. Lower bound = scale's largest step. */
export const DEFAULT_MAX_INTERVAL = 12;
export const MAX_INTERVAL_LIMIT = 18;
export const DEFAULT_SCALE_ID = 'major:do';

// --- Persistence ---
export const SETTINGS_STORAGE_KEY = 'trumpet-trainer.settings.v1';
export const THRESHOLD_STORAGE_KEY = 'trumpet-trainer.thresholdDb';

// --- Synth ---
/** Per-note envelope peak; the master gain carries the volume. */
export const SYNTH_ENVELOPE_PEAK_GAIN = 1;
/** Master-gain ramp when the volume changes during playback. */
export const SYNTH_VOLUME_RAMP_MS = 20;
```

Effective loudness: MVP peak = 0.25 × master 1; now peak = 1 × master `volume` → default 0.5 is twice the MVP level (idea §4: "louder").

**Files that use the removed constants and must be updated:**

| Constant | Files |
|---|---|
| `NOTE_DURATION_MS` | `src/training/useTrainingSession.ts`, `src/training/useTrainingSession.test.tsx`, `src/components/App.test.tsx`, `src/config/constants.test.ts` |
| `MELODY_LENGTH` | `src/music/melody.ts`, `src/music/melody.test.ts`, `src/testing/testMelody.ts`, `src/test/appTestUtils.tsx` (`boxStates`), `src/config/constants.test.ts`, doc comment in `src/training/trainingReducer.ts` |
| `SYNTH_PEAK_GAIN` | `src/audio/synth.ts`, `src/audio/synth.test.ts` (literal `0.25` expectations, master `gain.value` 1), `src/config/constants.test.ts` |
| local `PERCENT = 100` | `src/components/MicLevelMeter.tsx` → import `PERCENT` from constants |

`src/config/constants.test.ts`: replace the three removed rows with rows for every new constant.

## Core Features — Part 1

### 2. Music domain

#### 2.1 Scale catalog — `src/music/scales.ts` (new, pure)

```ts
export type ScaleType =
  | 'major' | 'minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian'
  | 'major-pentatonic' | 'minor-pentatonic';
export type ScaleOptionId = string;              // 'chromatic' | 'group:<x>' | '<type>:<tonic-slug>'
export type Alter = -1 | 0 | 1;
export interface SpecificScale {
  id: ScaleOptionId;                             // e.g. 'minor:fa-sharp'
  type: ScaleType;
  tonicName: string;                             // 'Fa#', 'Si♭', 'Do'
  keySignature: number;                          // −7..+7 (parent major; >0 sharps, <0 flats)
  pitchClasses: readonly number[];               // ascending, 0..11
}
export interface ScaleOption { id: ScaleOptionId; name: string; kind: 'chromatic' | 'group' | 'scale' }

export const CHROMATIC_ID = 'chromatic';
export const NOTE_LETTERS: readonly string[];           // ['Do','Re','Mi','Fa','Sol','La','Si']
export const LETTER_PITCH_CLASSES: readonly number[];   // [0, 2, 4, 5, 7, 9, 11]
export function keySignatureAlters(keySignature: number): readonly Alter[]; // per letter 0..6
export const SPECIFIC_SCALES: readonly SpecificScale[]; // 135, in option order
export const SCALE_OPTIONS: readonly ScaleOption[];     // 146, in display order
export function getScaleOption(id: ScaleOptionId): ScaleOption | undefined;
export function isScaleOptionId(value: unknown): value is ScaleOptionId;
export function resolveScaleMembers(id: ScaleOptionId): readonly SpecificScale[] | 'chromatic'; // throws on unknown id
export function largestStep(intervals: readonly number[]): number; // max gap incl. wrap to octave
export function minMaxInterval(id: ScaleOptionId): number;
export function searchScaleOptions(query: string): readonly ScaleOption[];
```

**Scale types** (idea §4.1). `parentDegree` = degree of the parent major scale the type starts on.

| `ScaleType` | Display label | Group name | Intervals | Largest step | `parentDegree` |
|---|---|---|---|---|---|
| `major` | major | All majors | 0 2 4 5 7 9 11 | 2 | 1 |
| `minor` | minor | All natural minors | 0 2 3 5 7 8 10 | 2 | 6 |
| `dorian` | dorian | All dorian | 0 2 3 5 7 9 10 | 2 | 2 |
| `phrygian` | phrygian | All phrygian | 0 1 3 5 7 8 10 | 2 | 3 |
| `lydian` | lydian | All lydian | 0 2 4 6 7 9 11 | 2 | 4 |
| `mixolydian` | mixolydian | All mixolydian | 0 2 4 5 7 9 10 | 2 | 5 |
| `locrian` | locrian | All locrian | 0 1 3 5 6 8 10 | 2 | 7 |
| `major-pentatonic` | major pentatonic | All major pentatonics | 0 2 4 7 9 | 3 | 1 |
| `minor-pentatonic` | minor pentatonic | All minor pentatonics | 0 3 5 7 10 | 3 | 6 |

**Key signatures.** Sharps are added in the order Fa Do Sol Re La Mi Si, flats in the order Si Mi La Re Sol Do Fa. `keySignatureAlters(k)` marks the first `k` letters of the sharp order `+1` (k > 0) or the first `−k` letters of the flat order `−1` (k < 0). Key signature order for every type: **0, +1 … +7, −1 … −7**.

**Tonic derivation.** For key signature `k`: parent major tonic letter = `((4·k) mod 7 + 7) mod 7` (each sharp moves up a fifth = 4 letters); type tonic letter = `(parentLetter + parentDegree − 1) mod 7`; alter = `keySignatureAlters(k)[letter]`; tonic pitch class = `(LETTER_PITCH_CLASSES[letter] + alter + 12) mod 12`. Pentatonics use the parent of the same-named major (major pentatonic) or relative major (minor pentatonic), so their tonics equal those of `major` / `minor`. `pitchClasses` = sorted `{(tonicPc + i) mod 12}` over the type's intervals.

**Tonics per type** (columns = key signature; 15 per type):

| Type | 0 | +1 | +2 | +3 | +4 | +5 | +6 | +7 | −1 | −2 | −3 | −4 | −5 | −6 | −7 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| major, major pentatonic | Do | Sol | Re | La | Mi | Si | Fa# | Do# | Fa | Si♭ | Mi♭ | La♭ | Re♭ | Sol♭ | Do♭ |
| minor, minor pentatonic | La | Mi | Si | Fa# | Do# | Sol# | Re# | La# | Re | Sol | Do | Fa | Si♭ | Mi♭ | La♭ |
| dorian | Re | La | Mi | Si | Fa# | Do# | Sol# | Re# | Sol | Do | Fa | Si♭ | Mi♭ | La♭ | Re♭ |
| phrygian | Mi | Si | Fa# | Do# | Sol# | Re# | La# | Mi# | La | Re | Sol | Do | Fa | Si♭ | Mi♭ |
| lydian | Fa | Do | Sol | Re | La | Mi | Si | Fa# | Si♭ | Mi♭ | La♭ | Re♭ | Sol♭ | Do♭ | Fa♭ |
| mixolydian | Sol | Re | La | Mi | Si | Fa# | Do# | Sol# | Do | Fa | Si♭ | Mi♭ | La♭ | Re♭ | Sol♭ |
| locrian | Si | Fa# | Do# | Sol# | Re# | La# | Mi# | Si# | Mi | La | Re | Sol | Do | Fa | Si♭ |

Spot checks: Re dorian ↔ k 0; Mi♭ minor ↔ k −6 (Sol♭ major); Fa♭ lydian ↔ k −7 (pitch classes = Mi lydian); Si# locrian ↔ k +7 (pitch classes = Do locrian).

**Ids and names.**

| Kind | Id | Name |
|---|---|---|
| chromatic | `chromatic` | Chromatic |
| group | `group:all` | All scales |
| group | `group:<type>` (e.g. `group:major`, `group:major-pentatonic`) | group name from the table |
| scale | `<type>:<slug>`; slug = lowercase letter + `-sharp` / `-flat` (e.g. `major:do`, `minor:fa-sharp`, `major:si-flat`, `lydian:fa-flat`, `minor-pentatonic:la`) | `<tonicName> <label>`: "Do major", "Mi minor", "Re dorian", "Do major pentatonic", "La minor pentatonic" |

Sharps are written `#` (as `noteName` already does, "Fa#"), flats `♭`. Ids are unique and stable (they are persisted).

**`SCALE_OPTIONS` order** (also the empty-query order of the selector): Chromatic; then the 10 groups: All scales, All majors, All natural minors, All dorian, All phrygian, All lydian, All mixolydian, All locrian, All major pentatonics, All minor pentatonics; then the 135 scales by type in the order major, minor, dorian, phrygian, lydian, mixolydian, locrian, major pentatonic, minor pentatonic, each type's tonics in the key-signature order above. `SPECIFIC_SCALES` uses the same order; `group:all` members = all 135 in that order; `group:<type>` members = that type's 15.

**`minMaxInterval(id)`:** chromatic → 1; specific scale → `largestStep` of its type (2 heptatonic, 3 pentatonic); group → max over members (`group:all` → 3, heptatonic groups → 2, pentatonic groups → 3).

**Search — `searchScaleOptions(query)`.** Normalize = lowercase, `♭`→`b`, `♯`→`#`, trim, collapse runs of whitespace. Empty normalized query → all options. Otherwise keep (in `SCALE_OPTIONS` order) options whose normalized name **or** normalized English alias contains the normalized query as a substring. English alias = the name with the tonic syllable replaced (Do→C, Re→D, Mi→E, Fa→F, Sol→G, La→A, Si→B): "Si♭ major" → "Bb major", "Fa# dorian" → "F# dorian". Chromatic and groups have alias = name. Display always stays solfège.

| Query | Result (in order) |
|---|---|
| `sib` | Si♭ major, Si♭ minor, Si♭ dorian, Si♭ phrygian, Si♭ lydian, Si♭ mixolydian, Si♭ locrian, Si♭ major pentatonic, Si♭ minor pentatonic |
| `bb major` | Si♭ major, Si♭ major pentatonic |
| `F# Dorian` | Fa# dorian |
| `re♭ major` | Re♭ major, Re♭ major pentatonic |
| `pent` | All major pentatonics, All minor pentatonics, then the 15 major pentatonics, then the 15 minor pentatonics (32) |
| `chrom` | Chromatic |
| `all` | the 10 groups |
| `xyz` | (empty) |

#### 2.2 Spelling in key — `src/music/spelling.ts`

```ts
export function spellInKey(melody: Melody, keySignature: number): string[];
export function spellExercise(exercise: Exercise): string[];
```

`spellInKey`: build pitch class → `{ letter, alter }` from `keySignatureAlters(keySignature)` (7 entries). For each note: if its pitch class is in the map, name = `NOTE_LETTERS[letter]` + `#`/`♭`/`''` + octave, with the **letter-based octave** `floor((midi − alter) / 12) − 1`. Otherwise (only reachable via the e2e `?melody=` hook) fall back to `noteName(midi, keySignature >= 0 ? 'sharp' : 'flat')`.
`spellExercise`: `exercise.scale === 'chromatic' ? spellMelody(exercise.notes) : spellInKey(exercise.notes, exercise.scale.keySignature)`. `spellMelody` is unchanged.

| Scale (key signature) | Written MIDI | Names |
|---|---|---|
| Fa major (−1) | 65, 70, 72 | Fa4, Si♭4, Do5 |
| Re dorian (0) | 62, 64, 65, 67, 69, 71, 72 | Re4, Mi4, Fa4, Sol4, La4, Si4, Do5 |
| Sol♭ major (−6) | 66, 71, 70 | Sol♭4, Do♭5, Si♭4 |
| Do# major (+7) | 60, 65, 61 | Si#3, Mi#4, Do#4 |
| Fa# major (+6) | 65, 66 | Mi#4, Fa#4 |
| Do♭ major (−7) | 54, 71 | Sol♭3, Do♭5 |
| Do major (0), out of key (e2e only) | 66, 70 | Fa#4, La#4 |
| Fa major (−1), out of key (e2e only) | 66 | Sol♭4 |

#### 2.3 Exercise generator — `src/music/melody.ts`

`generateMelody` is **removed**; `Rng` is kept.

```ts
export type Rng = () => number;                          // [0, 1)
export interface Exercise { notes: Melody; scale: SpecificScale | 'chromatic' }
export interface ExerciseOptions { length: number; maxInterval: number; scaleId: ScaleOptionId }
/** Written-range notes (WRITTEN_RANGE, ascending) whose pitch class is in the scale; chromatic → all 19. */
export function scaleCandidates(scale: SpecificScale | 'chromatic'): WrittenMidi[];
/** Math.min(n − 1, Math.floor(rng() * n)); consumes exactly one rng() call. */
export function pickIndex(rng: Rng, n: number): number;
export function generateExercise(rng: Rng, options: ExerciseOptions): Exercise;
```

Algorithm (rng call order is part of the contract, tests script it):
1. `members = resolveScaleMembers(scaleId)`. If an array of more than one scale (a group): `scale = members[pickIndex(rng, members.length)]` (**one** rng call). A specific scale → its single member, **no** rng call. Chromatic → `'chromatic'`, no rng call.
2. `candidates = scaleCandidates(scale)`; first note = `candidates[pickIndex(rng, candidates.length)]`.
3. Each next note: `reachable = candidates.filter(c => |c − prev| ≤ maxInterval)` (always contains `prev`), note = `reachable[pickIndex(rng, reachable.length)]`.
4. Return `{ notes, scale }` (`length` notes, `length` + 0 or 1 rng calls).

Worked example — Do major, `maxInterval` 12, `length` 3, rng = 0, 0.5, 0.99: candidates = 55 57 59 60 62 64 65 67 69 71 72 → first `candidates[0]` = 55; reachable from 55 = 55…67 (8) → index 4 = 62; reachable from 62 = all 11 → index 10 = 72. Result notes `[55, 62, 72]`, spelled Sol3, Re4, Do5. With `group:major` and rng = 0.6, … the first call picks member `floor(0.6·15)` = 9 → Si♭ major. Chromatic with `maxInterval` 18 reproduces the MVP distribution (every note uniform over 19).

### 3. Settings

#### 3.1 Model — `src/config/settings.ts` (new, pure)

```ts
export interface Settings {
  noteDurationMs: number;  // MIN..MAX_NOTE_DURATION_MS, multiple of NOTE_DURATION_STEP_MS
  melodyLength: number;    // integer MIN..MAX_MELODY_LENGTH
  volume: number;          // MIN_VOLUME..MAX_VOLUME (gain)
  maxInterval: number;     // integer minMaxInterval(scaleId)..MAX_INTERVAL_LIMIT
  scaleId: ScaleOptionId;  // a SCALE_OPTIONS id
}
export type ResetScope = 'all' | 'training';
export const DEFAULT_SETTINGS: Readonly<Settings>; // 1000, 5, 0.5, 12, DEFAULT_SCALE_ID
export function selectScale(settings: Settings, scaleId: ScaleOptionId): Settings;
export function resetSettings(settings: Settings, scope: ResetScope): Settings;
export function normalizeSettings(value: unknown): Settings;
export function parseThreshold(value: unknown): number;
```

- `selectScale`: `{ ...settings, scaleId, maxInterval: Math.max(settings.maxInterval, minMaxInterval(scaleId)) }`. It never lowers `maxInterval`.
- `resetSettings(s, 'all')` → a copy of `DEFAULT_SETTINGS`; `resetSettings(s, 'training')` → `{ ...s, noteDurationMs: DEFAULT_NOTE_DURATION_MS, volume: DEFAULT_VOLUME }`. Neither touches the threshold (it is not part of `Settings`).
- `normalizeSettings(value)`: if `value` is not a non-null object → `DEFAULT_SETTINGS`. Otherwise each field independently: kept if valid, else its default. Valid = `typeof === 'number'`, finite, in range, and: `noteDurationMs` a multiple of the step from the minimum; `melodyLength` and `maxInterval` integers (`maxInterval` range `minMaxInterval(CHROMATIC_ID)`..`MAX_INTERVAL_LIMIT`, i.e. 1..18); `scaleId` valid iff `isScaleOptionId`. Unknown extra keys are ignored. Finally apply the `selectScale` rule (raise `maxInterval` to the scale minimum).
- `parseThreshold(value)`: a finite number in `METER_MIN_DB..METER_MAX_DB` → itself, else `DEFAULT_THRESHOLD_DB`.

| `normalizeSettings` input | Output |
|---|---|
| `null`, `'x'`, `42`, `[]`-like garbage | `DEFAULT_SETTINGS` |
| `{}` | `DEFAULT_SETTINGS` |
| `{ noteDurationMs: 750, volume: 2, scaleId: 'major:fa' }` | 750, 5, **0.5**, 12, `major:fa` |
| `{ noteDurationMs: 760 }` (off-step) / `'750'` (string) | 1000 |
| `{ melodyLength: 9 }` / `4.5` | 5 |
| `{ maxInterval: 2, scaleId: 'group:major-pentatonic' }` | maxInterval **3** |
| `{ maxInterval: 1, scaleId: 'chromatic' }` | maxInterval 1 |
| `{ scaleId: 'major:xx' }` | `major:do` |

#### 3.2 Storage adapter — `src/config/settingsStorage.ts` (new, thin)

```ts
export function getBrowserStorage(): Storage | null;              // try { window.localStorage } catch → null
export function loadSettings(storage: Storage | null): Settings;
export function saveSettings(storage: Storage | null, settings: Settings): void;
export function loadThreshold(storage: Storage | null): number;
export function saveThreshold(storage: Storage | null, thresholdDb: number): void;
```

- `loadSettings`: `null` storage, missing key, a throwing `getItem` or invalid JSON → `DEFAULT_SETTINGS`; otherwise `normalizeSettings(JSON.parse(raw))`.
- `saveSettings`: `storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))`; errors (quota, `SecurityError`) are swallowed.
- `loadThreshold` / `saveThreshold`: same pattern with `THRESHOLD_STORAGE_KEY`, stored as `JSON.stringify(db)` (e.g. `"-35"`), read through `parseThreshold`.
- Nothing in this module throws. Invalid stored data is not rewritten until the next change.

Test helper **`src/test/fakeStorage.ts`** (new): `createFakeStorage(initial?: Record<string, string>): Storage` (Map-backed, full `Storage` interface) and `createThrowingStorage(): Storage` (every method throws `new DOMException('blocked', 'SecurityError')`).

### 4. Synth, services and fake

#### 4.1 `src/audio/synth.ts`

```ts
export interface PlaybackOptions { noteDurationMs: number; volume: number }
export interface Playback {
  readonly done: Promise<void>;
  stop(): void;
  /** Ramps the master gain to `volume` over SYNTH_VOLUME_RAMP_MS. No-op after finish/stop. */
  setVolume(volume: number): void;
}
export function playSequence(ctx: AudioContext, frequenciesHz: readonly number[], options: PlaybackOptions): Playback;
```

- Master gain starts at `options.volume` (was `UNITY_GAIN`); envelopes ramp to `SYNTH_ENVELOPE_PEAK_GAIN` instead of `SYNTH_PEAK_GAIN`. Graph, timing, `done` and `stop()` are otherwise unchanged.
- `setVolume(v)`: if finished → return; `now = ctx.currentTime`; `master.gain.cancelScheduledValues(now)`; `setValueAtTime(master.gain.value, now)`; `linearRampToValueAtTime(v, now + SYNTH_VOLUME_RAMP_MS / MS_PER_SECOND)`. No clamping (the settings model guarantees 0..1).

#### 4.2 `src/audio/services.ts`

`playMelody(frequenciesHz: readonly number[], options: PlaybackOptions): Playback;` — `createBrowserAudioServices` forwards to `playSequence(getAudioContext(), frequenciesHz, options)`. Update `services.test.ts` (`playMelody(freqs, { noteDurationMs: 500, volume: 0.5 })`) and `AudioServicesContext.test.tsx` if typing requires.

#### 4.3 `src/test/fakeAudioServices.ts`

```ts
export interface PlayCall {
  frequenciesHz: readonly number[];
  noteDurationMs: number;
  volume: number;
  /** Every setVolume(v) call on this playback, in order (recorded even after done/stop). */
  volumeChanges: number[];
}
```

`playMelody: vi.fn((frequenciesHz, options: PlaybackOptions) => …)` pushes `{ frequenciesHz: [...], noteDurationMs, volume, volumeChanges: [] }` and returns a playback whose `setVolume(v)` appends to that call's `volumeChanges`; `stop` and `finishPlayback` keep working as today. Update `fakeAudioServices.test.ts` accordingly.

## Acceptance Criteria — Part 1

**Constants**
- [ ] `MELODY_LENGTH`, `NOTE_DURATION_MS`, `SYNTH_PEAK_GAIN` no longer exist (grep finds no use); all new constants exist with the values above; `MicLevelMeter` uses the shared `PERCENT`.

**Scale catalog**
- [ ] `SCALE_OPTIONS` has 146 unique ids: 1 chromatic, 10 groups, 135 scales, in the documented order.
- [ ] For each type, the 15 tonic names match the tonic table in key-signature order; each scale's `keySignature` is its column.
- [ ] `pitchClasses` equal tonic + intervals mod 12 (e.g. Fa major `[0,2,4,5,7,9,10]`, Re dorian = Do major, Fa♭ lydian = Mi lydian).
- [ ] `largestStep` is 2 for every heptatonic type and 3 for both pentatonics; `minMaxInterval` returns 1 / 2 / 3 / 3 for chromatic / heptatonic scale or group / pentatonic scale or group / `group:all`.
- [ ] `resolveScaleMembers`: group → its members (15, or 135 for `group:all`), scale → `[itself]`, chromatic → `'chromatic'`; unknown id throws; `isScaleOptionId` is false for unknown strings and non-strings.
- [ ] Every row of the search table returns exactly the listed options in order; matching is case-insensitive and accepts `b`/`♭`, `#`/`♯`, solfège and English names.

**Spelling**
- [ ] `spellInKey` reproduces every row of the worked-example table, including Si#3 = 60, Mi#4 = 65, Do♭5 = 71 and the out-of-key fallbacks.
- [ ] `spellExercise` uses `spellMelody` for `'chromatic'` and `spellInKey(keySignature)` otherwise.

**Generator**
- [ ] For seeded runs over every option id, lengths 3–8 and max intervals min–18: every note is in the written range and in the exercise scale; consecutive notes differ by ≤ `maxInterval`; output has `length` notes.
- [ ] A group consumes exactly one extra rng call, first, to pick the scale; a specific scale or chromatic consumes exactly `length` calls; the returned `scale` is the picked specific scale (or `'chromatic'`).
- [ ] The worked example returns `{ notes: [55, 62, 72], scale: Do major }`; rng returning `0.999…` never indexes out of bounds.

**Settings and storage**
- [ ] `DEFAULT_SETTINGS` = 1000 ms, 5 notes, 0.5, 12, `major:do`.
- [ ] `selectScale` raises but never lowers `maxInterval`; `resetSettings` scopes behave as specified; every `normalizeSettings` table row holds; `parseThreshold` accepts −60..0 and rejects NaN, ±Infinity, strings, out-of-range.
- [ ] Storage round-trip with a fake storage restores settings and threshold; `null` storage, a throwing storage and invalid JSON return defaults and never throw; saving to a throwing storage does not throw.

**Synth / services / fake**
- [ ] `playSequence` sets the master gain to `volume`, envelopes peak at 1; `setVolume` cancels and ramps the master gain over 20 ms and is a no-op after `stop()` or natural end.
- [ ] `createBrowserAudioServices().playMelody(freqs, options)` forwards the options; the fake records `volume` and `volumeChanges`.
