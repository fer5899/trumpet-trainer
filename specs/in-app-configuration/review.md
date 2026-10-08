# Code Review: In-app Configuration

## Summary

**Pass with notes.** Part 1 (`prd.md`) is fully implemented and matches the spec. Every claim in `implementation-notes.md` was checked against the code. Part 2 (`prd2.md`) is not implemented yet, as the notes say. The temporary bridge in `App`, `useTrainingSession` and `testMelody` is small and won't get in Part 2's way. There are no critical issues. There are 3 warnings and 8 suggestions.

## PRD Compliance

| Requirement | Source | Status | Notes |
|---|---|---|---|
| Remove `MELODY_LENGTH`, `NOTE_DURATION_MS`, `SYNTH_PEAK_GAIN` | prd.md §Constants | OK | They now appear only in the test that asserts they are gone (`constants.test.ts:52`) |
| New exercise, persistence and synth constants with the PRD values | prd.md §Constants | OK | `constants.ts:25-48, 79-82`; every value is asserted |
| `MicLevelMeter` uses the shared `PERCENT` | prd.md §Constants | OK | |
| `SCALE_OPTIONS`: 146 unique ids in the documented order | prd.md §2.1 | OK | `scales.ts:140-145` |
| Tonic table (9 types × 15 key signatures), `keySignature` = column | prd.md §2.1 | OK | Built from rules in `buildScale` (`scales.ts:117-130`); the full table is asserted |
| `pitchClasses`, `largestStep`, `minMaxInterval` (1/2/3/3) | prd.md §2.1 | OK | Spot checks cover Fa♭ lydian, Si# locrian and Mi♭ minor |
| `resolveScaleMembers` (throws on unknown id), `isScaleOptionId`, `getScaleOption` | prd.md §2.1 | OK | Map-backed, so prototype keys can't match |
| `searchScaleOptions`: normalization, English aliases, every search-table row | prd.md §2.1 | OK | `scales.ts:194-219` |
| `spellInKey` (letter-based octave, out-of-key fallback), `spellExercise` | prd.md §2.2 | OK | Every worked-example row, plus a sweep over all 135 scales |
| `generateMelody` removed; `Exercise`, `scaleCandidates`, `pickIndex`, `generateExercise` | prd.md §2.3 | OK | rng contract, worked example and the 0.999… bound are all tested |
| Seeded property test over all ids × lengths 3–8 × max intervals | prd.md AC Generator | OK | |
| `Settings`, `DEFAULT_SETTINGS` (frozen), `selectScale`, `resetSettings` | prd.md §3.1 | OK | |
| `normalizeSettings` field-by-field validation; every table row | prd.md §3.1 | OK | |
| `parseThreshold` | prd.md §3.1 | OK | |
| Storage adapter: `getBrowserStorage`, load/save for settings and threshold; never throws | prd.md §3.2 | OK | |
| `src/test/fakeStorage.ts` | prd.md §3.2 | OK | |
| `PlaybackOptions`; master gain = volume; envelope peak 1; `setVolume` 20 ms ramp, no-op after stop or end | prd.md §4.1 | OK | One shared `rampMaster` helper (`synth.ts:121`) |
| `AudioServices.playMelody(freqs, options)` forwards the options | prd.md §4.2 | OK | |
| Fake `PlayCall` records `volume` and `volumeChanges` | prd.md §4.3 | OK | |
| Reducer `createInitialTrainingState(exercise)` + `spellExercise` | prd2.md §5.1 | Not implemented (pending) | Only the doc comment changed |
| Hook: live `noteDurationMs`/`volume`, refs, volume effect | prd2.md §5.2 | Not implemented (pending) | Bridge uses the `DEFAULT_*` constants (`useTrainingSession.ts:77-81`) |
| `App` with `storage` prop, settings state, persistence | prd2.md §6.1 | Not implemented (pending) | Bridge builds a chromatic exercise with max interval 18 (`App.tsx:49-55`) |
| `SettingsButton`, `SettingsDialog`, `ScaleCombobox`, `settingsText`, CSS | prd2.md §6.2–6.6 | Not implemented (pending) | |
| `?melody=` accepting 3–8 notes, `getTestExercise` | prd2.md §7.1 | Not implemented (pending) | Still exactly `DEFAULT_MELODY_LENGTH` notes |
| `setup.ts` dialog stub, `renderApp` storage, `openSettings` | prd2.md §7.2 | Not implemented (pending) | |
| `e2e/settings.spec.ts` | prd2.md §7.3 | Not implemented (pending) | |
| `CLAUDE.md` final updates | prd2.md | Not implemented (pending) | The interim text is accurate |

## TODO: Critical Issues (must fix)

None

## TODO: Warnings (should fix)

- [x] **[src/config/settings.test.ts]** (code at `src/config/settings.ts:38-44, 84`) — No test checks that `DEFAULT_SCALE_ID` (`constants.ts:44`) is a valid catalog id, or that `DEFAULT_MAX_INTERVAL >= minMaxInterval(DEFAULT_SCALE_ID)`. `normalizeSettings` always calls `selectScale` → `minMaxInterval` → `resolveScaleMembers`, which throws on an unknown id. A typo in the default would therefore make `loadSettings` throw: the throw happens outside the adapter's try/catch, so the app would crash on load. **Fix:** add `expect(isScaleOptionId(DEFAULT_SETTINGS.scaleId)).toBe(true)` and `expect(DEFAULT_SETTINGS.maxInterval).toBeGreaterThanOrEqual(minMaxInterval(DEFAULT_SETTINGS.scaleId))` to `settings.test.ts`.
- [x] **[src/training/useTrainingSession.ts:77-81]** (with `src/components/App.tsx:47-55`) — The bridge keeps the MVP melodies (chromatic, interval 18), but playback already uses the new defaults: 1000 ms per note and twice the MVP loudness (envelope 1 × master 0.5, against 0.25 × 1). If Part 1 reaches the deploy branch alone, CI publishes slower, louder playback that users can't change. **Fix:** ship Parts 1 and 2 in the same PR, or record "do not release Part 1 alone" in the PR description and the CHANGELOG `[Unreleased]` entry.
- [x] **[src/music/melody.test.ts:19]** (also `src/music/scales.test.ts:95`, `src/music/spelling.test.ts:6`) — The test helper `scaleById(id)` is copy-pasted in three files. **Fix:** define it once, either in a shared test helper (e.g. `src/test/scales.ts`) or as a production `getSpecificScale(id): SpecificScale | undefined` next to `getScaleOption` in `scales.ts`, which Part 2's `getTestExercise` can also use. Import it in all three tests.

## TODO: Suggestions (nice to have)

- [x] **[src/music/scales.ts:187-192]** — `minMaxInterval` recomputes `largestStep` for every member on every call (135 members for `group:all`). Part 2 calls it on every `SettingsDialog` render, on every `selectScale` and in `normalizeSettings`. **Fix:** precompute a `Map<ScaleOptionId, number>` at module load, next to `MEMBERS_BY_ID`, and look values up in it. Keep the throw for unknown ids.
- [x] **[src/music/scales.ts:203-207]** — `englishAlias` recovers the tonic by matching the display name with `startsWith` against `NOTE_LETTERS`. This only works because no syllable is a prefix of another and every name starts with its tonic. **Fix:** build the alias in `buildScale`, where the letter index is already known. Store it on the option, or build `SEARCH_INDEX` from `SPECIFIC_SCALES`.
- [x] **[src/music/scales.ts:79-80, 96-98]** — The solfège letters and the `#`/`♭` signs are defined both here (`NOTE_LETTERS`, `SHARP_SIGN`, `FLAT_SIGN`, `alterSign`) and in `src/music/notes.ts:39-42` (`PITCH_CLASS_NAMES`). Also, `spelling.ts` imports these note-level primitives from the scale catalog. **Fix:** move the letter and accidental primitives into `notes.ts`, derive `PITCH_CLASS_NAMES` from them, and import them from `notes.ts` in both `scales.ts` and `spelling.ts`.
- [x] **[src/config/settings.ts:78]** — `normalizeSettings` checks that `volume` is in range but not that it is on a step. A stored `0.333` is accepted, so Part 2's 5 %-step slider would show "33%". **Fix:** reject off-step values (as `noteDurationMs` already does) or snap them to `VOLUME_STEP_PERCENT / PERCENT`. Add table rows for both cases.
- [x] **[src/config/settings.ts:89]** — `parseThreshold` accepts off-step values such as `-35.5` dB. **Fix:** reject them or snap to `THRESHOLD_STEP_DB`, and add table rows.
- [x] **[src/music/scales.ts:215-219]** — Plain substring matching (which is what the PRD specifies) gives noisy results for short queries. For example, "b major" also matches the "Bb/Eb/Ab/Db/Gb/Cb major" aliases, and "do" matches every dorian option. **Fix (consider during Part 2's combobox work):** rank prefix and whole-word matches before plain substring matches, keeping `SCALE_OPTIONS` order within each tier.
- [x] **[src/music/spelling.test.ts:~91]** — The sweep test hard-codes `19`, `54` and `12`. **Fix:** use `scaleCandidates(scale)` from `melody.ts`, or `WRITTEN_RANGE` and `SEMITONES_PER_OCTAVE`.
- [x] **[specs/in-app-configuration/implementation-notes.md]** — The notes don't mention a test-infrastructure change outside the PRD: `TIMER_DRIFT_MARGIN_MS = 100` (`src/test/sessionDriver.ts:15`) now replaces the 1 ms boundary margins in `App.test.tsx` and `useTrainingSession.test.tsx`. **Fix:** add one line under "Implementation details" with the reason (flaky boundary checks under `shouldAdvanceTime`).

## Technical Debt Assessment

**Neutral to slightly reducing.**
- **Generated, not hand-typed:** the scale catalog is built from rules (9 type descriptors × 15 key signatures), not from 135 hand-typed entries.
- **Pure rules, thin adapters:** all decisions (catalog, validation, rng contract) are pure and covered by table or property tests. `settingsStorage.ts` and the synth changes stay thin adapters with injected seams.
- **Less duplication:** `rampMaster` removes the duplicated ramp code between `stop()` and `setVolume()`.
- **Clean code:** no `any`, no unused imports or exports, explicit return types, and the removed constants are fully gone.
- **Less flakiness:** the timer-margin change makes the timing tests more robust.

New debt is small:
- the `scaleById` helper copied into three test files;
- letter and accidental primitives split between `notes.ts` and `scales.ts`;
- `englishAlias` parsing display names;
- the temporary bridge, which Part 2 must remove:
  - `App.tsx:47-55`
  - `useTrainingSession.ts:77-81`
  - `testMelody.ts:15`
  - the bridge-specific App test ("generates a chromatic exercise…")
  - `appTestUtils.tsx:38-39`, where `boxStates` still uses `DEFAULT_MELODY_LENGTH`

**Security:**
- The `?melody=` validation is unchanged and sound: an integer regex plus a range check, active only in the e2e build.
- Stored JSON is parsed inside try/catch and validated field by field.
- React renders all text, so there is no XSS path.
- No secrets in the code.

**Performance:** building the catalog and search index at module load is trivial (146 options).

## Files Reviewed

- `CLAUDE.md`: interim status, architecture tree and conventions are accurate for the current code.
- `README.md`: "1 s each" is correct; the threshold text is still accurate.
- `src/config/constants.ts`, `constants.test.ts`: match the PRD. The removed constants are asserted absent, and defaults are checked against their limits and steps.
- `src/config/settings.ts`, `settings.test.ts` (new): pure model with the full normalize table. Missing: a test that the defaults are consistent with the catalog (Warning 1).
- `src/config/settingsStorage.ts`, `settingsStorage.test.ts` (new): thin, never throws, storage is injected. Covers null, throwing, invalid-JSON and quota-exceeded storage.
- `src/test/fakeStorage.ts` (new): complete `Storage` fakes.
- `src/music/scales.ts`, `scales.test.ts` (new): correct, data-driven catalog. See Suggestions.
- `src/music/spelling.ts`, `spelling.test.ts`: `spellInKey` and `spellExercise` are correct, including Si#3, Mi#4, Do♭5 and the out-of-key fallbacks.
- `src/music/melody.ts`, `melody.test.ts`: the generator follows the rng contract exactly; strong property tests.
- `src/audio/synth.ts`, `synth.test.ts`: volume lives on the master gain and `setVolume` is guarded by `finished`. Tests cover stop, natural end and the fallback timer.
- `src/audio/services.ts`, `services.test.ts`: options are forwarded.
- `src/test/fakeAudioServices.ts`, `.test.ts`: `volume` and `volumeChanges` are recorded.
- `src/test/sessionDriver.ts`: `TIMER_DRIFT_MARGIN_MS` is outside the PRD but justified.
- `src/test/appTestUtils.tsx`: part of the bridge (`boxStates` uses `DEFAULT_MELODY_LENGTH`).
- `src/components/App.tsx`, `App.test.tsx`: bridge exercise generation; tests updated for the new play-call shape and timer margin.
- `src/components/MicLevelMeter.tsx`: uses the shared `PERCENT`.
- `src/testing/testMelody.ts`: part of the bridge (exactly `DEFAULT_MELODY_LENGTH` notes).
- `src/training/trainingReducer.ts`: doc comment only.
- `src/training/useTrainingSession.ts`, `.test.tsx`: bridge playback options; StrictMode handling unchanged.

## Verification

Run on 2026-10-08:

| Command | Result |
|---|---|
| `npm test` | Passed: 24 test files, 1027 tests |
| `npm run lint` | Passed, no findings |
| `npm run typecheck` | Passed, no errors |

E2E (`npm run test:e2e`) was not run. Part 1 doesn't change any e2e-visible behaviour except the playback tempo and volume.
