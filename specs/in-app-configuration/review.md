# Code Review: In-app Configuration

## Summary

**Pass with notes.** Both parts match `prd.md` and `prd2.md`, and every TODO from the earlier Part 1 review has been fixed. There are no critical issues. There are two warnings: a mouse-focus gap in the scale listbox, and missing release metadata (`bump.txt`, `CHANGELOG.md`) for Part 2.

## PRD Compliance

| Requirement | Source | Status | Notes |
|---|---|---|---|
| Constants: `MELODY_LENGTH`/`NOTE_DURATION_MS`/`SYNTH_PEAK_GAIN` removed; `DEFAULT_`/`MIN_`/`MAX_` limits, `PERCENT`, storage keys and synth gain/ramp added | prd.md §Constants | OK | `constants.ts:25-48, 79-82` |
| Scale catalog: 146 options in order, tonic table, key signatures, pitch classes, `largestStep`/`minMaxInterval`, `resolveScaleMembers`, `isScaleOptionId`, `getScaleOption` | prd.md §2.1 | OK | Built from rules (`scales.ts:114-163`); `minMaxInterval` precomputed (`:198-211`) |
| `searchScaleOptions`: normalization, English aliases, ranked tiers | prd.md §2.1 (updated) | OK | `scales.ts:214-254`; aliases come from `buildScale`, not from parsing names |
| `spellInKey` / `spellExercise` | prd.md §2.2 | OK | |
| `Exercise`, `scaleCandidates`, `pickIndex`, `generateExercise` + rng contract | prd.md §2.3 | OK | Property test covers all ids × lengths × intervals |
| `Settings`, `DEFAULT_SETTINGS`, `selectScale`, `resetSettings`, `normalizeSettings` (off-step volume rejected), `parseThreshold` (off-step rejected) | prd.md §3.1 | OK | `settings.ts:41-105` |
| Storage adapter (injected `Storage \| null`, never throws) + `fakeStorage.ts` | prd.md §3.2 | OK | `settingsStorage.ts:11-52` |
| Synth master gain = volume, envelope peak 1, `setVolume` 20 ms ramp (no-op after end); `playMelody(freqs, options)`; fake `PlayCall.volume`/`volumeChanges` | prd.md §4 | OK | |
| Reducer `createInitialTrainingState(exercise)` via `spellExercise`; transitions unchanged | prd2.md §5.1 | OK | `trainingReducer.ts:30-32` |
| Hook: live `noteDurationMs`/`volume` refs synced before the playing effect; `playbackRef`; volume effect; playing-effect deps unchanged | prd2.md §5.2 | OK | `useTrainingSession.ts:60-126`; deps `[phase, melody, services, tracker]` |
| `App({ storage })`, load/save of settings and threshold, Start uses `getTestExercise ?? generateExercise(settings)` | prd2.md §6.1 | OK | `App.tsx:22-75` |
| Dialog stays open across a screen change; its mode follows the screen | prd2.md §6.1 | OK | `App.tsx:106-112`; App test "dialog stays open when the exercise completes" |
| `main.tsx` injects `getBrowserStorage()` | prd2.md §6.1 | OK | `main.tsx:15` |
| `SettingsButton` (aria-label, aria-haspopup, U+2699 U+FE0E, disabled while starting) | prd2.md §6.2 | OK | |
| `SettingsDialog`: always mounted, content only while open, `showModal`/`close` sync, Close/Esc/cancel/forced-close ownership, no backdrop close | prd2.md §6.3 | OK | Focus goes to the `<dialog>`, not the first control. Intentional and documented (implementation-notes "Flagged" #1) |
| Five controls with limits, step, visible value and `aria-valuetext`; Training mode + hint; Reset scopes; threshold untouched | prd2.md §6.3 | OK | `SettingsDialog.tsx:110-163` |
| `settingsText.ts` formatters (incl. "1 semitone") | prd2.md §6.3 | OK | |
| `ScaleCombobox` behavior table, ARIA, in-flow list, `tabIndex=-1` listbox (addendum) | prd2.md §6.4 | OK | ArrowDown on a closed list opens it at the current value (documented interpretation #2). See Warning 1 |
| `TrainingScreen` forwards props; one box per note | prd2.md §6.5 | OK | |
| CSS: toolbar, gear, wrapping boxes with `--note-box-size`, dialog/backdrop/mobile sheet, setting rows, combobox | prd2.md §6.6 | OK | `styles.css:40-44, 72-82, 212-239, 263-378` |
| `?melody=` accepts 3–8 notes; `getTestExercise(scaleId)` | prd2.md §7.1 | OK | `testMelody.ts:13-36`; tests cover 2/3/8/9 notes and major:do, major:fa, groups, chromatic |
| `setup.ts` dialog stubs; `renderApp(fake, { storage })`, `boxStates()` counts boxes, `openSettings()` | prd2.md §7.2 | OK | |
| `e2e/settings.spec.ts` scenarios 1–6 | prd2.md §7.3 | OK | Adds a Tab-order test, 320/1280 px layout checks and focus return to the gear |
| Acceptance criteria: gear/dialog, combobox, training, persistence | prd2.md | OK | Each is covered by component tests or e2e |
| CLAUDE.md / README updates | prd2.md §CLAUDE.md Updates | OK | Both match the current code |

## TODO: Critical Issues (must fix)

None

## TODO: Warnings (should fix)

- [x] **[src/components/ScaleCombobox.tsx:115-133]** — Only the `<li>` options call `preventDefault` on `mousedown`. A mousedown elsewhere in the listbox, such as its vertical padding (`styles.css:349`, `padding: 0.25rem 0`), reaches the `<ul>`. The `<ul>` has `tabIndex={-1}`, so it takes focus. The input then blurs, `closeAndRevert` unmounts the list, and focus drops to `<body>`. This is the same failure the Tab fix addressed, now reachable by mouse. Pressing the scrollbar may cause it too in Chromium. **Fix:** put one `onMouseDown={(e) => e.preventDefault()}` on the `<ul>` and remove the per-`<li>` handlers. Add a test: `fireEvent.mouseDown(listbox)` keeps the input focused and the list open.
- [ ] **[bump.txt (missing), CHANGELOG.md:7]** — Part 2 changes user-visible behavior: the Settings panel, the new defaults (Do major, octave leaps), persistence and 3–8 note melodies. `## [Unreleased]` is empty and there is no `bump.txt`, so the `release-metadata` CI job will fail the PR. CLAUDE.md requires both before a PR. **Fix:** run `/t-prepare-pr`, which adds `bump.txt` (`minor`) and `### Added` / `### Changed` entries under `## [Unreleased]`.

## TODO: Suggestions (nice to have)

- [x] **[src/components/SettingsDialog.tsx:78-81]** — In a real browser, `showModal()` first focuses the Scale input. Its `onFocus` (`ScaleCombobox.tsx:96-99`) opens the list and renders 146 `<li>`. Then `el.focus()` blurs the input and closes the list again. The result looks right, but every Home-mode open pays for a throw-away render, and screen readers may briefly announce an expanded combobox. The jsdom stub can't show this. **Fix:** set `autofocus` on the `<dialog>` before `showModal()` (for example `dialogRef.current.setAttribute('autofocus', '')`) so the HTML dialog focusing steps focus the dialog itself. Keep `el.focus()` as a fallback, and confirm in e2e that the list stays closed.
- [x] **[src/components/ScaleCombobox.tsx:109]** — `onChange` runs `searchScaleOptions(text)` only to pick the active index, and the render runs the same search again (line 27). `activeOptionId` already ignores an index ≥ `results.length`. **Fix:** call `setActiveIndex(0)` here and let the derived value handle the no-results case.
- [x] **[src/components/SettingsDialog.tsx:147-149]** — The volume ↔ percent conversion (`Math.round(volume * PERCENT)` / `percent / PERCENT`) is written separately here, in `src/components/settingsText.ts:8` and in `src/config/settings.ts:75`. **Fix:** export `volumeToPercent` / `percentToVolume` from `settings.ts` and use them in all three places.
- [x] **[src/components/SettingsDialog.tsx:29]** — `INTEGER_STEP = 1` (the Melody length and Max interval slider step) is defined in a component. The other slider steps live in `constants.ts`. **Fix:** add `MELODY_LENGTH_STEP` and `MAX_INTERVAL_STEP` (both 1) to `constants.ts` and use them here.
- [x] **[e2e/settings.spec.ts:134, 169-172]** — Scenario 5 uses an all-71 melody, which the 440 Hz fake mic matches. The test must click Give up within about 4 s, before the exercise completes. This is a possible flake (implementation-notes "Known issues"). **Fix:** use a melody the fake mic never matches (e.g. `?melody=60,60,60,60,60,60,60,60`). The layout assertions stay the same and the race goes away.
- [x] **[e2e/settings.spec.ts:6-7]** — The storage keys are copied as string literals. If `SETTINGS_STORAGE_KEY` is bumped, the seeded-storage tests would silently test nothing. **Fix:** import `SETTINGS_STORAGE_KEY` / `THRESHOLD_STORAGE_KEY` from `src/config/constants.ts` (that file has no imports).
- [x] **[specs/in-app-configuration/implementation-notes.md:138-139]** — The note "Parts 1 and 2 ship in the same PR. No `bump.txt`…" is stale: Part 1 was released on its own as v0.2.0 (`cad2846`, `348d002`). **Fix:** record what actually happened, and update the test count at line 263 to 1286.
- [x] **[.claude/launch.json]** — This file is untracked and not gitignored. Its `dev` entry uses port 5173, which `npm run test:e2e` / `dev:e2e` also needs. **Fix:** either commit it as shared tooling (consider a port other than 5173) or add it to `.gitignore`.

## Technical Debt Assessment

**Neutral to slightly reducing.**

- The Part 1 bridge is gone: the hook no longer hard-codes `DEFAULT_*` playback values, `testMelody` no longer requires exactly 5 notes, and `boxStates` counts the rendered boxes.
- All 11 TODOs from the Part 1 review are fixed and checked in the code.

The new code follows the CLAUDE.md conventions:
- Settings rules live in pure `settings.ts`.
- Only `settingsStorage.ts` touches storage, and the storage is injected.
- Components get audio only through `useAudioServices`.
- Written→concert conversion happens only at the boundaries.
- Settings changes are not reducer actions.
- Closing the dialog is owned by the `open` prop.
- Effects are StrictMode-safe.
- There is no `any`, and public functions have explicit return types.

Test quality is high:
- Tests use behavioral RTL queries.
- The hook covers volume while playing, idle, after Repeat and after give up, plus duration on Repeat.
- App covers a remount round-trip and throwing, null and invalid storage.

Remaining minor debt (all listed under Suggestions):
- The volume/percent conversion is written in three places.
- `INTEGER_STEP` is defined outside `constants.ts`.
- The scale list briefly opens and closes when the dialog opens.
- The e2e storage keys are copied as literals.

**Security:**
- `?melody=` is validated with an integer regex and a range check, and is honored only when `VITE_E2E === 'true'`.
- Stored JSON is parsed inside try/catch and validated field by field; lookups are Map-backed.
- The search query is never compiled into a RegExp.
- There is no `dangerouslySetInnerHTML` and there are no secrets.

**Performance:**
- The catalog, search index and `minMaxInterval` are computed once at module load.
- The 146 options are rendered only while the list is open.
- The volume effect runs only when the volume changes.
- Each `localStorage` write is about 100 bytes, which is negligible.

## Files Reviewed

- `CLAUDE.md`, `README.md`: match the code.
- `CHANGELOG.md`, `version.txt`, `package.json`: v0.2.0 (Part 1) is released; `[Unreleased]` is empty for Part 2 (Warning 2).
- `specs/in-app-configuration/implementation-notes.md`: thorough; the release note and test count are stale.
- `src/config/constants.ts`, `settings.ts`, `settingsStorage.ts` (+ tests): a pure model and a thin adapter; off-step values are rejected.
- `src/music/notes.ts`, `scales.ts`, `spelling.ts`, `melody.ts` (+ tests): letter primitives are in `notes.ts`, `getSpecificScale` is added, and the generator contract is unchanged.
- `src/audio/synth.ts`, `services.ts` (+ tests): no issues.
- `src/training/trainingReducer.ts`, `useTrainingSession.ts` (+ tests): refs, `playbackRef` ownership and the volume effect are correct.
- `src/testing/testMelody.ts` (+ test): accepts 3–8 notes; `getTestExercise` uses `getSpecificScale`.
- `src/components/App.tsx` (+ test, 38 tests): storage prop, save-on-change, and the dialog mode follows the screen.
- `src/components/SettingsButton.tsx` (+ test): matches the PRD.
- `src/components/SettingsDialog.tsx` (+ test): closing and controls are correct; the scale list briefly opens on `showModal` (Suggestion).
- `src/components/ScaleCombobox.tsx` (+ test): the listbox mousedown gap (Warning 1) and the double search (Suggestion).
- `src/components/settingsText.ts` (+ test): pure formatters.
- `src/components/TrainingScreen.tsx`, `MicLevelMeter.tsx`, `src/main.tsx`, `src/styles.css`: as specified.
- `src/test/*` helpers: guarded dialog stubs, `renderApp` storage injection, `openSettings`, `requireSpecificScale`.
- `e2e/settings.spec.ts`: scenarios 1–6 plus the Tab order test; the scenario 5 race and the copied storage keys (Suggestions).
- `.claude/launch.json`: untracked preview config (Suggestion).

## Verification

Run on 2026-10-09 against the working tree:

| Command | Result |
|---|---|
| `npm test` | Pass: 28 files, 1286 tests |
| `npm run lint` | Pass (no output) |
| `npm run typecheck` | Pass (no output) |
| `npm run test:e2e` | Not run in this review |
