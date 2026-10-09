# in-app-configuration In-app Configuration

# Implementation notes

---

# prd.md implementation

## Requirements

Implements `specs/in-app-configuration/prd.md` (Part 1 of 2): constants, music domain (scale catalog, spelling in key,
exercise generator), settings model + storage adapter, synth volume / `AudioServices.playMelody` options / fake services.
Part 2 (`prd2.md`: hook, UI, App wiring, e2e) is **not** implemented yet.

| PRD requirement | Status |
|---|---|
| Remove `MELODY_LENGTH`, `NOTE_DURATION_MS`, `SYNTH_PEAK_GAIN`; add all new constants; `MicLevelMeter` uses shared `PERCENT` | Implemented |
| `SCALE_OPTIONS`: 146 unique ids (1 chromatic, 10 groups, 135 scales) in documented order | Implemented |
| Tonic names per type × key signature match the tonic table; `keySignature` = column | Implemented |
| `pitchClasses` = tonic + intervals mod 12 (spot checks incl. Fa♭ lydian, Si# locrian) | Implemented |
| `largestStep` / `minMaxInterval` (1 / 2 / 3 / 3) | Implemented |
| `resolveScaleMembers` (groups, scale, chromatic, throws on unknown); `isScaleOptionId` | Implemented |
| `searchScaleOptions`: every search-table row, case/♭/♯/solfège/English | Implemented |
| `spellInKey` every table row incl. Si#3, Mi#4, Do♭5 and out-of-key fallbacks; `spellExercise` | Implemented |
| `generateExercise`: range/scale/interval/length property over all ids × lengths 3–8 × max intervals | Implemented |
| rng call contract (group +1 call first; scale/chromatic exactly `length`); worked example; 0.999… safe | Implemented |
| `DEFAULT_SETTINGS`, `selectScale`, `resetSettings`, `normalizeSettings` table, `parseThreshold` | Implemented |
| Storage adapter round-trip; null / throwing storage / invalid JSON → defaults, never throws | Implemented |
| `src/test/fakeStorage.ts` (`createFakeStorage`, `createThrowingStorage`) | Implemented |
| `playSequence` master gain = volume, envelope peak 1, `setVolume` ramp 20 ms, no-op after stop/end | Implemented |
| `playMelody(freqs, options)` forwarding; fake `PlayCall.volume` / `volumeChanges` | Implemented |

Nothing flagged or skipped.

## Initial considerations

- Removing `generateMelody`, `MELODY_LENGTH`, `NOTE_DURATION_MS` and changing `playMelody`'s signature breaks Part 2's
  consumers (hook, App, `?melody=` hook). To keep the tree green between PRDs, consumers got a **minimal temporary
  bridge** instead of Part 2's API (see Implementation details → Bridging). Part 2 replaces it.
- The bridge generates chromatic melodies with `maxInterval` 18, which reproduces the MVP distribution and spelling
  exactly, rather than switching to the new default (Do major) before the UI to change it exists.

## Design

```
constants.ts ──► scales.ts (catalog, search, minMaxInterval, keySignatureAlters)
                    │
                    ├─► spelling.ts  spellInKey / spellExercise (spellMelody unchanged)
                    ├─► melody.ts    generateExercise(rng, {length, maxInterval, scaleId}) → Exercise {notes, scale}
                    └─► settings.ts  Settings value object: selectScale / resetSettings / normalizeSettings / parseThreshold
                                        ▲
settingsStorage.ts (ADAPTER, Storage injected, never throws) ── load/save settings + threshold

synth.ts playSequence(ctx, freqs, {noteDurationMs, volume}) → Playback {done, stop, setVolume}
services.ts AudioServices.playMelody(freqs, options) → playSequence
```

All decisions (catalog derivation, rng consumption, validation) are pure and table/property-tested; the storage and synth
modules stay thin adapters.

## Implementation details

- `src/config/constants.ts`: removed the three constants; added exercise-setting defaults/limits, `PERCENT`, storage keys,
  `SYNTH_ENVELOPE_PEAK_GAIN`, `SYNTH_VOLUME_RAMP_MS`.
- `src/music/scales.ts` (new): 9 type descriptors × key-signature order `0, +1..+7, −1..−7`. Tonic letter
  `= (4k mod 7 + parentDegree − 1) mod 7`, alteration from `keySignatureAlters(k)`. Ids/slugs/names generated from the
  same data, so nothing is typed per scale. Search normalizes (lowercase, ♭→b, ♯→#, trim, collapse spaces) and matches the
  name or an English alias (leading solfège syllable → C..B). Extra export `alterSign(alter)` (beyond the PRD list) reused
  by spelling.
- `src/music/spelling.ts`: `spellInKey` maps pitch class → `{letter, alter}` from the key signature, letter-based octave
  `floor((midi − alter)/12) − 1` (so 60 in Do# major = Si#3); out-of-key notes fall back to `noteName` with sharp/flat by
  key-signature sign. `spellExercise` dispatches on `'chromatic'`.
- `src/music/melody.ts`: `generateMelody` removed; `Exercise`, `ExerciseOptions`, `scaleCandidates`, `pickIndex`,
  `generateExercise` implement the PRD algorithm and rng-call contract verbatim.
- `src/config/settings.ts` (new): pure model. `DEFAULT_SETTINGS` is frozen. `normalizeSettings` validates field by field
  (arrays → defaults), then applies `selectScale` to raise `maxInterval` to the scale minimum. Volume is range-checked
  only (the PRD does not require the 5 % step on load).
- `src/config/settingsStorage.ts` (new, ADAPTER): `getBrowserStorage` + load/save for settings and threshold; every access
  in `try/catch`; storage injected.
- `src/test/fakeStorage.ts` (new): Map-backed `Storage` and an always-throwing `SecurityError` storage.
- `src/audio/synth.ts`: `PlaybackOptions`; master gain starts at `volume`; envelopes peak at `SYNTH_ENVELOPE_PEAK_GAIN`;
  `setVolume` cancels scheduled values, pins the current value and ramps over `SYNTH_VOLUME_RAMP_MS`; no-op once finished
  (natural end, fallback timer or `stop()`).
- `src/audio/services.ts`: `playMelody(freqs, options)` forwards to `playSequence`.
- `src/test/fakeAudioServices.ts`: `PlayCall` gains `noteDurationMs`, `volume`, `volumeChanges`; fake playback
  `setVolume` records into `volumeChanges`.
- `src/components/MicLevelMeter.tsx`: imports `PERCENT`.
- `src/test/sessionDriver.ts`: `TIMER_DRIFT_MARGIN_MS = 100` (outside the PRD) replaces the 1 ms "not yet" / "now"
  boundary margins in `App.test.tsx` and `useTrainingSession.test.tsx`: under `vi.useFakeTimers({ shouldAdvanceTime:
  true })` the fake clock also moves with real time, so 1 ms margins were flaky.

### Bridging (temporary, replaced by prd2.md)

- `src/components/App.tsx`: melody = `getTestMelody() ?? generateExercise(Math.random, { length: DEFAULT_MELODY_LENGTH,
  maxInterval: MAX_INTERVAL_LIMIT, scaleId: CHROMATIC_ID }).notes`.
- `src/training/useTrainingSession.ts`: `playMelody(freqs, { noteDurationMs: DEFAULT_NOTE_DURATION_MS, volume:
  DEFAULT_VOLUME })`.
- `src/testing/testMelody.ts`, `src/test/appTestUtils.tsx`: `MELODY_LENGTH` → `DEFAULT_MELODY_LENGTH` (`?melody=` still
  requires exactly 5 notes).
- `src/training/trainingReducer.ts`: doc comment only.
- Tests: `App.test.tsx` spies on `generateExercise` (+1 test asserting the bridge arguments); play-call expectations in
  `App.test.tsx` / `useTrainingSession.test.tsx` include the new options.
- e2e: unchanged; ~5 s playback at 1000 ms/note fits the existing timeouts (verified, 3 passed).

## Tests

Unit tests: 320 → **1027** (24 files), all passing. `npm run test:scripts` 32/32, `npm run test:e2e` 3/3.

| File | Tests | Covers |
|---|---|---|
| `src/music/scales.test.ts` (new) | 266 | option order/count/uniqueness, full tonic table, key signatures, pitch classes for all 135, largestStep/minMaxInterval, members, search table + normalization |
| `src/music/melody.test.ts` (rewritten) | 315 | worked example, rng call counts, group pick, 0.999… bounds, seeded property over all 146 ids × lengths × intervals |
| `src/config/settings.test.ts` (new) | 65 | defaults, selectScale, reset scopes, every normalize row + range edges, parseThreshold |
| `src/config/settingsStorage.test.ts` (new) | 23 | round-trip, null/throwing/invalid JSON/missing key, quota errors, getBrowserStorage, fake storage helpers |
| `src/config/constants.test.ts` | 49 | new constants, removed constants absent |
| `src/music/spelling.test.ts` | 32 | all spellInKey rows, sweep over 135 scales, spellExercise dispatch |
| `src/audio/synth.test.ts` | 21 (was 12) | master gain = volume, envelope peak, setVolume ramp, no-op after stop/end/fallback |
| `src/test/fakeAudioServices.test.ts` | 7 (was 5) | volume / volumeChanges recording |
| `src/audio/services.test.ts` | 7 | options forwarding |
| `src/components/App.test.tsx` | 25 (was 24) | bridge arguments |

The generator property test was mutation-checked (breaking the interval filter fails 147 tests).

## Documentation updates

- `CLAUDE.md`: status (Part 1 done, Part 2 pending, bridge described); architecture list adds `scales.ts`, `settings.ts`,
  `settingsStorage.ts` (ADAPTER), `fakeStorage.ts`, and updates `constants.ts`, `spelling.ts`, `melody.ts`, `synth.ts`,
  `fakeAudioServices.ts`; conventions for scales/spelling, rng contract, storage injection, volume on master gain.
- `README.md`: notes are now 1 s each (was 0.5 s).

## Performance

The catalog (146 options) is built once at module load. The property test asserts once per option instead of per note
(5.7 s → ~0.15 s).

## Known issues

- **Release (what happened):** the plan was to ship Parts 1 and 2 in one PR, but Part 1 was released on its own as
  **v0.2.0** (`cad2846` prepared it, `348d002` is the CI release commit; the bridge defaults above shipped with it).
  Part 2 is released separately and needs its own `bump.txt` and `CHANGELOG.md` entry.
- ~~Until prd2.md lands, the app plays MVP-style chromatic melodies but with the new defaults already active: notes last
  1000 ms (was 500 ms) and playback is 2× louder (peak 1 × master 0.5 vs 0.25 × 1). Settings are not yet persisted or
  editable; `settingsStorage` is not wired into the app.~~ **Resolved by prd2.md:** the bridge is gone; the app uses
  the persisted settings (see "prd2.md implementation" below).

## Tech debt reduction (after /t-review #1)

All 11 review items fixed (`review.md`); unit tests 1027 → **1196**, lint and typecheck clean.

- `settings.test.ts`: defaults are consistent with the catalog (`isScaleOptionId(DEFAULT_SETTINGS.scaleId)`,
  `maxInterval >= minMaxInterval(scaleId)`).
- `scales.ts`: new `getSpecificScale(id)` (Map-backed, `undefined` for groups/chromatic/unknown/prototype keys);
  `src/test/scales.ts` `requireSpecificScale` replaces the `scaleById` copies in `melody`/`scales`/`spelling` tests.
- `scales.ts`: `minMaxInterval` precomputed in a Map at module load (still throws on unknown ids).
- `scales.ts`: `buildScale` returns an internal entry (scale, option, English name built from the letter index);
  `SPECIFIC_SCALES`, `SCALE_OPTIONS` and the search index derive from it — no more `startsWith` name parsing.
- `notes.ts`: now owns `Alter`, `NOTE_LETTERS`, `LETTER_PITCH_CLASSES`, `SHARP_SIGN`, `FLAT_SIGN`, `alterSign`;
  `PITCH_CLASS_NAMES` derived from them (values unchanged); `scales.ts` and `spelling.ts` import from `notes.ts`.
- `settings.ts`: `normalizeSettings` rejects off-step `volume` (must be a whole percent multiple of
  `VOLUME_STEP_PERCENT`; 0.333 → default); `parseThreshold` rejects off-step dB (−35.5 → default). PRD §3.1 updated.
- `scales.ts`: `searchScaleOptions` ranks matches (name prefix → word prefix → substring, catalog order within a tier),
  e.g. "b major" lists Si major first, "do" lists Do-tonic options before dorian. PRD §2.1 updated; every PRD search
  table row still passes.
- `spelling.test.ts`: the 135-scale sweep uses `scaleCandidates(scale)` instead of hard-coded 19 / 54 / 12.

---

# prd2.md implementation

## Requirements

Implements `specs/in-app-configuration/prd2.md` (Part 2 of 2): reducer initializer, live settings in
`useTrainingSession`, App wiring with injected storage, gear button, Settings dialog, scale combobox, CSS, the
`?melody=` hook for 3–8 notes, test infrastructure and `e2e/settings.spec.ts`. The Part 1 bridge is removed.

| PRD requirement | Status |
|---|---|
| 5.1 `createInitialTrainingState(exercise)` spells with `spellExercise`; transitions unchanged | Implemented |
| 5.2 hook takes `exercise`, live `noteDurationMs` / `volume`; refs synced before the playing effect; `playbackRef`; volume effect (`setVolume` once, none when idle/equal); playing deps unchanged | Implemented |
| 6.1 `App({ storage })`, settings/threshold loaded + saved, Start uses `getTestExercise(scaleId) ?? generateExercise(…settings)`, toolbar + dialog, mode follows screen, dialog stays open on screen change | Implemented |
| 6.1 `main.tsx` renders `<App storage={getBrowserStorage()} />` | Implemented |
| 6.2 `SettingsButton` (aria-label, aria-haspopup, U+2699 U+FE0E, disabled while starting) | Implemented |
| 6.3 `SettingsDialog` (always-mounted `<dialog>`, content only while open, showModal/close sync, Esc/Close/cancel/forced close, five controls with limits/steps/valuetext, Training mode + hint, Reset scopes) | Implemented (focus detail flagged below) |
| 6.3 `settingsText.ts` formatters | Implemented |
| 6.4 `ScaleCombobox` (every row of the behavior table, ARIA, in-flow list) | Implemented (ArrowDown-on-closed detail flagged below) |
| 6.5 `TrainingScreen` forwards exercise / duration / volume; one box per note | Implemented |
| 6.6 CSS: toolbar, gear, wrapping note boxes with `--note-box-size`, dialog + backdrop + mobile sheet, setting rows, combobox | Implemented |
| 7.1 `parseTestMelody` 3–8 notes; `getTestExercise(scaleId)` | Implemented |
| 7.2 `setup.ts` dialog stubs; `renderApp(fake, { storage })`, `boxStates()` counts boxes, `openSettings()` | Implemented |
| 7.3 `e2e/settings.spec.ts` scenarios 1–6 | Implemented (scenario 5 also checks 320 px and desktop) |
| Acceptance criteria (gear/dialog, combobox, training, persistence) | All covered by unit/component tests and e2e |
| CLAUDE.md / README.md updates | Done |

### Flagged / interpretation choices

1. **Initial focus in the dialog (6.3).** Native `showModal()` focuses the first focusable control. In Home mode that
   is the Scale input, and focus opens the scale list (6.4), so the dialog would open with the list expanded and the
   first Esc would only close the list, contradicting e2e scenario 1 ("Esc closes"). After `showModal()` the effect
   calls `el.focus()` on the `<dialog>` (`tabIndex={-1}`), the APG recommendation when the first control is a
   complex widget. Tab then reaches Scale (list opens). Focus still returns to the gear on close (native).
2. **ArrowDown/ArrowUp on a closed list (6.4)** "opens if closed; moves activeIndex by ±1": opening shows the current
   value as active and does not also move by one (so the highlight starts on the selected scale, as on focus).
3. **Empty "No matching scales" row:** also prevents `mousedown` so clicking it keeps focus and the list open
   (otherwise the blur would close the list; the PRD only says "not selectable").
4. **`getTestExercise`** uses `getSpecificScale(scaleId)` (Part 1 helper), which is exactly "a `scale` option whose
   `resolveScaleMembers` is a single member"; chromatic and groups → `'chromatic'`.
5. **Escape with the list open** calls both `preventDefault()` and `stopPropagation()` (as specified); the dialog's
   `onKeyDown` additionally ignores `defaultPrevented` events, so either guard suffices.

## Initial considerations

- Settings stay out of the reducer (PRD 5.1): they never change phase or progress, so they are plain props of the
  hook, read through refs (duration) or pushed to the running playback (volume).
- jsdom 25 has no `HTMLDialogElement.showModal`/`close`; verified before stubbing (`typeof el.showModal ===
  'undefined'`). Focus restoration and the top layer cannot be tested in jsdom, so they are covered by e2e.

## Design

```
main.tsx ── getBrowserStorage() ──► App { storage }
                                     │ settings  = useState(loadSettings(storage))   ─┐ saveSettings / saveThreshold
                                     │ threshold = useState(loadThreshold(storage))  ─┘ on every change
                                     ├─ SettingsButton (disabled while starting) ──► settingsOpen = true
                                     ├─ HomeScreen (onThresholdChange → save)
                                     ├─ TrainingScreen { exercise, mic, thresholdDb, noteDurationMs, volume }
                                     │     └─ useTrainingSession
                                     │          noteDurationRef/volumeRef ← props (effect before 'playing')
                                     │          'playing' effect: playMelody(freqs, {refs}) → playbackRef
                                     │          volume effect [volume]: playbackRef?.setVolume once
                                     └─ SettingsDialog { open, mode = screen, settings, onChange → save }
                                           ├─ ScaleCombobox → selectScale(settings, id)
                                           └─ sliders → { ...settings, field }; Reset → resetSettings(scope)

Start: unlock() → flushSync → openMicrophone → getTestExercise(scaleId) ?? generateExercise(Math.random, settings)
```

## Implementation details

- `src/training/trainingReducer.ts`: `createInitialTrainingState(exercise)` → `melody = exercise.notes`,
  `names = spellExercise(exercise)`.
- `src/training/useTrainingSession.ts`: args `exercise`, `noteDurationMs`, `volume`. A ref-sync effect (no deps) is
  declared before the playing effect, so on a Repeat render the playing effect reads the newest values. The playing
  effect stores `{ playback, volume }` in `playbackRef` and clears it (only if it is still its own entry) when `done`
  settles or the playback is stopped. The volume effect (deps `[volume]`) calls `setVolume` only if something is
  playing and the applied volume differs, then records it. A Repeat render that changes both phase and volume does not
  call `setVolume` (the new playback already starts at the new volume).
- `src/components/App.tsx`: `AppProps { storage }`; the `Screen` now carries an `Exercise`; save-on-change handlers;
  the `SettingsDialog` mode follows the screen, so a completion while the dialog is open switches it to Home mode.
- `src/components/SettingsButton.tsx` (new), `src/components/SettingsDialog.tsx` (new, with an internal
  `SettingSlider`), `src/components/ScaleCombobox.tsx` (new; `query: string | null` where `null` means "show the
  selected name", plus `isOpen` and `activeIndex`; option ids `${listId}-option-${i}`; the active option is scrolled
  into view with an optional `scrollIntoView?.()` call), `src/components/settingsText.ts` (new).
- `src/components/TrainingScreen.tsx`: new props forwarded to the hook.
- `src/testing/testMelody.ts`: length check `MIN_MELODY_LENGTH..MAX_MELODY_LENGTH`; `getTestExercise`.
- `src/main.tsx`: injects `getBrowserStorage()`.
- `src/styles.css`: as PRD 6.6. `.settings-button` joins the `.button` border/disabled/focus rules and overrides size
  and padding. The volume slider's `min`/`max` are `volumeToPercent(MIN_VOLUME)` / `volumeToPercent(MAX_VOLUME)` (no new
  constants).
- `src/test/setup.ts`: guarded `showModal`/`close` stubs. `src/test/appTestUtils.tsx`: `renderApp(fake, { storage })`
  (default `createFakeStorage()`, `null` kept), returns `storage` and `user`, adds `openSettings`; `boxStates()` reads
  the rendered `note-box-N` elements.

## Tests

Unit/component tests: 1196 → **1285** (28 files), all passing (1297 after /t-review #2, see below).
`npm run test:scripts` 32/32. `npm run test:e2e` 3 → **9** passed (10 with the Tab-order test from /t-fix). Lint and typecheck clean; build OK.

| File | Tests | Covers |
|---|---|---|
| `src/training/trainingReducer.test.ts` | 35 | initializer with chromatic (contextual) and Fa major (Si♭) exercises; 3- and 8-note completion |
| `src/training/useTrainingSession.test.tsx` | 25 | play call uses the props; volume change while playing → one `volumeChanges` entry, no replay, no stop; none on mount / equal value / idle / listening / after give up; duration change → next Repeat, progress kept; Repeat then volume → only the new playback |
| `src/testing/testMelody.test.ts` | 28 | 3 and 8 valid, 2 and 9 invalid; `getTestExercise` with `major:do`, `major:fa` (Si♭4), `group:all`, `group:major`, `chromatic`, absent param, flag off |
| `src/components/settingsText.test.ts` (new) | 15 | all formatters incl. "1 semitone" |
| `src/components/SettingsButton.test.tsx` (new) | 2 | name, aria-haspopup, glyph, disabled |
| `src/components/ScaleCombobox.test.tsx` (new) | 16 | closed state; open on click/Tab with 146 options in order, current active, text selected; scrollIntoView; filtering ("bb major"); no matches; clamped arrows; Enter; click; Esc (prevented + not propagated; closed Esc propagates); ArrowDown reopens; blur revert; listbox `tabindex="-1"` (fix below); ARIA attributes |
| `src/components/SettingsDialog.test.tsx` (new) | 26 | open/close sync (showModal/close spies); focus on the dialog; Close / Esc / Esc in the combobox; cancel prevented; forced close → onClose; backdrop click; combobox reset on reopen; Home controls (limits/steps/values/valuetext); live onChange per control; selectScale raise; max-interval min follows the scale; Reset scopes; Training mode + hint; mode switch while open |
| `src/components/App.test.tsx` | 38 (was 25) | generator called with the settings; threshold saved to the fake storage (real `Storage.prototype` untouched); gear on both screens / disabled while starting; Esc; settings + threshold round-trip across remount; seeded storage → generator args, 8 boxes, play options; 3 boxes; key spelling; throwing and `null` storage; invalid data; Reset never touches the threshold; training dialog (setVolume once, no restart, listening continues, training reset, duration on Repeat); dialog stays open on completion and switches to Home mode |
| `e2e/settings.spec.ts` (new) | 7 | PRD 7.3 scenarios 1–6, plus Tab from the open Scale list → Melody length (fix below); scenario 1 also asserts focus returns to the gear; scenario 5 also checks 4 + 4 at 320 px, equal box size and one row at 1280 px |

Not unit-tested (jsdom limits): native focus restoration, the top layer/backdrop and the Chromium close-request abuse
protection; covered by e2e (focus) and the manual checklist.

## Documentation updates

- `CLAUDE.md`: intro (settings panel, `localStorage`), specs status (both parts implemented, bridge paragraph
  removed), architecture tree (new components, `settingsText.ts`, `e2e/settings.spec.ts`; updated `melody.ts`,
  `trainingReducer.ts`, `useTrainingSession.ts`, `testMelody.ts`, `App.tsx`, `TrainingScreen.tsx`, `main.tsx`,
  `setup.ts`, `appTestUtils.tsx`), conventions (App storage prop, live settings, dialog closing/focus and jsdom stubs,
  `?melody=` 3–8 notes spelled in key).
- `README.md`: "How it works" (defaults, threshold remembered), new "Settings" section, `?melody=` 3–8 notes.
- `specs/in-app-configuration/create-environment.sh`: dev (5173), e2e-mode dev (5174) and production preview (4173),
  example `?melody=` URLs.
- `specs/in-app-configuration/validation.md`: "Human Validation — prd2.md" appended.

## Performance

`searchScaleOptions` runs on each keystroke and render while the list is open (146 options, precomputed index:
negligible). The full list renders 146 `<li>` only while open. The volume effect is O(1) and only runs when the volume
changes.

## Known issues

- **Release:** Part 1 is released (v0.2.0). Part 2's `bump.txt` (`minor`) and `CHANGELOG.md` entry still have to be
  added before the PR (`/t-prepare-pr`).
- The Chromium close-request abuse protection (a second Esc without user activation may force-close the dialog) is
  mitigated as the PRD says (native `close` → `onClose()`), but it cannot be reproduced in automated tests.
- ~~e2e scenario 5 uses an all-Si4 8-note melody that the fake microphone matches, so it must give up while listening,
  before the exercise completes (≈ 4 s window).~~ **Resolved after /t-review #2:** it now uses all-Do4, which the fake
  microphone never matches.

## Fix: Tab from the Scale field dropped focus to the page body (/t-fix)

- **Root cause:** Chromium makes a scrollable container with no focusable children keyboard-focusable. With the list
  open, Tab from the input focused the `<ul role="listbox">` (`overflow-y: auto`); the input's `onBlur`
  (`closeAndRevert`) then unmounted the list and focus fell to `<body>`. jsdom does not model this, so unit tests passed.
- **Fix:** `src/components/ScaleCombobox.tsx`: the listbox gets `tabIndex={-1}` (options stay reachable via
  `aria-activedescendant`). Tab now moves to Melody length, closing the list and reverting the text.
- **PRD:** `prd2.md` §6.4 addendum (Tab order + acceptance criterion).
- **Tests:** `ScaleCombobox.test.tsx` (listbox `tabindex="-1"`) and `e2e/settings.spec.ts` (click Scale, Tab →
  Melody length focused, list gone, value unchanged); the e2e test failed before the fix in Chromium.

## Tech debt reduction (after /t-review #2)

8 of 9 review items fixed (`review.md`); unit tests 1286 → **1297** (28 files), `test:scripts` 32/32, e2e 10/10,
lint and typecheck clean.

- **Listbox mousedown (warning):** the single `onMouseDown` `preventDefault` now sits on the `<ul role="listbox">`
  instead of each `<li>`, so a press on the list padding or scrollbar no longer focuses the `tabIndex=-1` list and
  blur-closes it. Test: pressing the listbox keeps the input focused, the list open and selects nothing.
- **Dialog focus:** `SettingsDialog` sets the `autofocus` attribute on the `<dialog>` before `showModal()`, so the
  browser's dialog focusing steps focus the dialog and never the Scale input (no throw-away 146-option render, no
  "expanded" announcement); `el.focus()` stays as the fallback. React's `autoFocus` prop renders no attribute, hence
  `setAttribute`. Test: the attribute is present when `showModal` runs. e2e scenario 1 asserts the dialog is focused,
  `aria-expanded="false"` and no listbox.
- **Double search:** the combobox `onChange` sets `activeIndex` to 0; `activeOptionId` already yields null without
  results.
- **Volume ↔ percent:** `volumeToPercent` / `percentToVolume` exported from `src/config/settings.ts` and used by
  `isValidVolume`, `formatVolume` and the volume slider (min, max, value, onChange). Tests: table + round-trip of every
  slider step through `normalizeSettings`.
- **Slider steps:** `MELODY_LENGTH_STEP` and `MAX_INTERVAL_STEP` (both 1) added to `constants.ts` (+ constants table
  test); `INTEGER_STEP` removed from `SettingsDialog`.
- **e2e:** `settings.spec.ts` imports `SETTINGS_STORAGE_KEY` / `THRESHOLD_STORAGE_KEY` from `src/config/constants.ts`;
  the 8-box layout test uses `?melody=60,60,60,60,60,60,60,60` (no race with completion).
- **`.claude/launch.json`:** added to `.gitignore` (per-developer desktop preview config; its port 5173 would clash
  with `test:e2e` if shared).
- **Notes:** the stale "same PR" release note now records the v0.2.0 release of Part 1.
- **Not done here:** `bump.txt` + `CHANGELOG.md` `[Unreleased]` entries (review warning 2) — left to `/t-prepare-pr`,
  as the review's fix says.
