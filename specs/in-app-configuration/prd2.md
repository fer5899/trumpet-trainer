# In-app Configuration - Product Requirements Document (Part 2 of 2)

> Continuation of `specs/in-app-configuration/prd.md` (Part 1), which defines the overview, goals, implementation decisions, the constants changes (`DEFAULT_*`/`MIN_*`/`MAX_*` settings constants, `PERCENT`, storage keys, `SYNTH_ENVELOPE_PEAK_GAIN`, `SYNTH_VOLUME_RAMP_MS`), the scale catalog (`src/music/scales.ts`: `ScaleOptionId`, `SpecificScale`, `SCALE_OPTIONS`, `getScaleOption`, `minMaxInterval`, `resolveScaleMembers`, `searchScaleOptions`), `spellInKey` / `spellExercise`, the generator (`Exercise`, `generateExercise`), the settings model (`Settings`, `DEFAULT_SETTINGS`, `selectScale`, `resetSettings`, `normalizeSettings`), the storage adapter (`getBrowserStorage`, `loadSettings`, `saveSettings`, `loadThreshold`, `saveThreshold`, `src/test/fakeStorage.ts`) and the audio changes (`PlaybackOptions`, `Playback.setVolume`, `AudioServices.playMelody(freqs, options)`, fake `PlayCall.volume` / `volumeChanges`). Read Part 1 first. Behavior source of truth: `specs/in-app-configuration/idea.md`.
> **Brownfield note:** paths marked **(new)** do not exist yet; every other path exists and is modified.

## Core Features — Part 2

### 5. Training session

#### 5.1 Reducer — `src/training/trainingReducer.ts`

```ts
export interface TrainingState {
  phase: TrainingPhase;
  melody: Melody;                 // = exercise.notes, MIN_MELODY_LENGTH..MAX_MELODY_LENGTH notes
  names: readonly string[];       // spellExercise(exercise), computed once
  matchedCount: number;
}
export function createInitialTrainingState(exercise: Exercise): TrainingState; // phase 'playing', matchedCount 0
```

Only the initializer changes (it takes an `Exercise` and spells with `spellExercise`). `TrainingAction`, `selectNoteBoxes`, `selectCanAct` are unchanged. The transition table is **unchanged** (any other pair returns the same object reference):

| From | Action | To |
|---|---|---|
| `playing` | `playbackEnded` | `guard` |
| `guard` | `guardElapsed` | `listening` |
| `listening` | `noteMatched` | `listening` with `matchedCount + 1`; `complete` when it reaches `melody.length` |
| `listening` | `repeatRequested` | `playing` (matchedCount unchanged) |

Settings changes are **not** reducer actions: they never change the phase or progress.

#### 5.2 Hook — `src/training/useTrainingSession.ts`

```ts
export interface UseTrainingSessionArgs {
  exercise: Exercise;        // was `melody`
  mic: MicrophoneSession;
  thresholdDb: number;
  noteDurationMs: number;    // live; read when a playback starts
  volume: number;            // live; applied to the running playback
  onExit: () => void;
}
```

`useReducer(trainingReducer, exercise, createInitialTrainingState)`; `melody` below is `state.melody`. Changes to the MVP effects:

1. **Refs.** `noteDurationRef` and `volumeRef` hold the latest props, synced by an effect declared **before** the playing effect (so a Repeat render reads the newest values). `playbackRef: { playback: Playback; volume: number } | null` holds the running playback and the volume last applied to it.
2. **Enter `playing`:** `services.playMelody(melody.map(m => midiToHz(writtenToConcert(m))), { noteDurationMs: noteDurationRef.current, volume: volumeRef.current })`; set `playbackRef`; clear it when `done` settles or the playback is stopped. Effect deps stay `[phase, melody, services, tracker]`: duration and volume are **not** deps, so changing them never restarts playback.
3. **Volume effect (new, deps `[volume]`):** if `playbackRef.current` is set and its `volume !== volume` → `playback.setVolume(volume)` and record it. No call when nothing is playing (including on mount, where the volumes are equal).
4. Guard, listening, complete and unmount effects: unchanged. A note-duration change therefore applies from the next `playing` (Repeat); the exercise is never restarted and `matchedCount` is kept.

### 6. UI

#### 6.1 `App` — `src/components/App.tsx`

```ts
export interface AppProps { storage: Storage | null }
type Screen = { name: 'home' } | { name: 'training'; exercise: Exercise; mic: MicrophoneSession };
```

- `storage` is injected (required prop). `src/main.tsx` renders `<App storage={getBrowserStorage()} />`; tests pass a fake storage (see 7.2). Components never touch `localStorage` themselves.
- State: `settings = useState(() => loadSettings(storage))`, `thresholdDb = useState(() => loadThreshold(storage))`, `settingsOpen: boolean`, plus the existing `screen`, `testMicActive`, `testMicError`, `startError`, `starting`.
- `handleSettingsChange(next)`: `setSettings(next); saveSettings(storage, next)`. `handleThresholdChange(db)`: `setThresholdDb(db); saveThreshold(storage, db)` (passed to `HomeScreen` instead of `setThresholdDb`).
- **Start training**, step 4 becomes: `exercise = getTestExercise(settings.scaleId) ?? generateExercise(Math.random, { length: settings.melodyLength, maxInterval: settings.maxInterval, scaleId: settings.scaleId })`. Steps 1–3 (synchronous `unlock()`, `flushSync`, open mic) are unchanged.
- Render:

```tsx
<main className="app">
  <div className="app__toolbar">
    <SettingsButton onClick={() => setSettingsOpen(true)} disabled={starting} />
  </div>
  {screen.name === 'training'
    ? <TrainingScreen exercise={screen.exercise} mic={screen.mic} thresholdDb={thresholdDb}
        noteDurationMs={settings.noteDurationMs} volume={settings.volume} onExit={handleExit} />
    : <HomeScreen … onThresholdChange={handleThresholdChange} … />}
  <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)}
    mode={screen.name === 'training' ? 'training' : 'home'} settings={settings} onChange={handleSettingsChange} />
</main>
```

- If the exercise completes (or the screen otherwise changes) while the dialog is open, the dialog **stays open** and its mode follows the screen (it then shows all Home controls). This is the only way the screen can change while the modal is open.

#### 6.2 `SettingsButton` — `src/components/SettingsButton.tsx` (new)

```ts
export interface SettingsButtonProps { onClick(): void; disabled?: boolean }
```

`<button type="button" className="settings-button" aria-label="Settings" aria-haspopup="dialog" disabled={disabled} onClick={onClick}><span aria-hidden="true">⚙︎</span></button>` (U+2699 + U+FE0E text presentation). Top-right on both screens, disabled while Start is opening the microphone.

#### 6.3 `SettingsDialog` — `src/components/SettingsDialog.tsx` (new)

```ts
export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
  mode: 'home' | 'training';
  settings: Settings;
  onChange(settings: Settings): void;
}
```

- A `<dialog className="settings-dialog" aria-labelledby={titleId}>` that is always mounted; its content renders only while `open` (so the combobox state resets on every opening). An effect syncs the element: `open && !el.open → el.showModal()`, `!open && el.open → el.close()`.
- **Closing is owned by the `open` prop:** the Close button → `onClose()`; `onKeyDown` on the dialog: `Escape` and `!event.defaultPrevented` → `onClose()`; `onCancel` (native Esc) → always `event.preventDefault()`; native `close` event while `open` is still true (browser forced it) → `onClose()`. Backdrop clicks do nothing. Focus returns to the gear button (native `showModal` behavior).
- Every change calls `onChange` with a whole new `Settings` immediately (no Save):

| Control (label) | Shown in | Input | Visible value / `aria-valuetext` | `onChange` |
|---|---|---|---|---|
| Scale | home | `ScaleCombobox` | selected option name | `selectScale(settings, id)` |
| Melody length | home | range 3–8 step 1 | "5 notes" | `{ ...settings, melodyLength }` |
| Max interval | home | range `minMaxInterval(settings.scaleId)`–18 step 1 | "12 semitones", "1 semitone" | `{ ...settings, maxInterval }` |
| Note duration | home, training | range 250–1500 step 50 | "1000 ms" | `{ ...settings, noteDurationMs }` |
| Playback volume | home, training | range 0–100 step 5, value `Math.round(volume × PERCENT)` | "50%" | `{ ...settings, volume: value / PERCENT }` |

- Each slider: `<label htmlFor>` with the label text, `<input type="range" min max step value aria-valuetext>` and a visible value `<span className="setting__value" aria-hidden="true">`. All limits come from constants / `minMaxInterval`.
- Training mode shows only Note duration and Playback volume, followed by the helper text `Other settings can be changed on the home screen.` (`<p className="settings-dialog__hint">`).
- Footer: `Reset to defaults` → `onChange(resetSettings(settings, mode === 'home' ? 'all' : 'training'))`; `Close` (primary) → `onClose()`. Reset never touches the microphone threshold (not part of `Settings`).
- Text helpers live in `src/components/settingsText.ts` (new, pure): `formatNoteDuration(ms)` → "1000 ms", `formatVolume(volume)` → "50%", `formatMelodyLength(n)` → "5 notes", `formatMaxInterval(n)` → "1 semitone" | "N semitones".

#### 6.4 `ScaleCombobox` — `src/components/ScaleCombobox.tsx` (new)

```ts
export interface ScaleComboboxProps { value: ScaleOptionId; onChange(id: ScaleOptionId): void }
```

Markup (ids from `useId()`): `<label htmlFor={inputId}>Scale</label>`, `<input id={inputId} role="combobox" aria-autocomplete="list" aria-expanded={isOpen} aria-controls={listId} aria-activedescendant={activeOptionId ?? undefined} autoComplete="off" spellCheck={false}>`, and **while open** `<ul id={listId} role="listbox" aria-label="Scales">` with `<li role="option" id aria-selected>` per result. Internal state: `query`, `isOpen`, `activeIndex`.

| Situation | Behavior |
|---|---|
| Closed | Input shows `getScaleOption(value).name`; no listbox rendered. |
| Focus / click on input | Opens the full list (`query` ''), selects the input text, `activeIndex` = index of `value`, scrolled into view (`scrollIntoView?.({ block: 'nearest' })`, optional call: jsdom lacks it). |
| Typing | `query` = input text; results = `searchScaleOptions(query)`; list open; `activeIndex` 0 (or −1 if none). |
| ArrowDown / ArrowUp | Opens if closed; moves `activeIndex` by ±1, clamped to the results (no wrap); `preventDefault`. |
| Enter | If open and an option is active → select it; `preventDefault`. |
| Option click | `onMouseDown` → `preventDefault` (keeps focus, no blur revert); `onClick` → select. |
| Select | `onChange(id)`, close the list, input shows the option name, `query` reset. |
| Escape with list open | `preventDefault()` + `stopPropagation()`; close the list, revert the text. The dialog stays open (see 6.3). |
| Escape with list closed | Not handled → the dialog closes. |
| Blur (Tab, click outside) | Close the list, revert the text; no change. |
| No results | One `<li role="option" aria-disabled="true" aria-selected="false">No matching scales</li>`; not selectable; `aria-activedescendant` unset. |

`aria-selected="true"` marks the **active** (highlighted) option (APG combobox pattern); when the list opens, that is the current value. The listbox is in normal flow below the input (not absolutely positioned) so it is never clipped by the dialog, with `max-height: 15rem; overflow-y: auto`.

<!-- Added: fix for Tab from the Scale field dropping focus to the page body -->
**Addendum — Tab order.** Tab from the input (list open or closed) moves focus to the next control in the dialog (Melody length on Home), closing the list and reverting the text. The listbox is never a Tab stop: it carries `tabIndex={-1}`, because Chromium makes a scrollable container without focusable children keyboard-focusable, and focusing it would blur the input, unmount the list and drop focus to `<body>`. Options are reached only via `aria-activedescendant`. *Acceptance:* the open `listbox` has `tabindex="-1"` (`ScaleCombobox.test.tsx`); in Chromium, clicking Scale then pressing Tab focuses the Melody length slider, the list is gone and the input shows the previous scale (`e2e/settings.spec.ts`).

#### 6.5 `TrainingScreen` and `NoteBox`

`TrainingScreenProps = { exercise: Exercise; mic; thresholdDb; noteDurationMs: number; volume: number; onExit }`, all forwarded to `useTrainingSession`. Status text, buttons and `NoteBox` markup are unchanged; the number of boxes = `exercise.notes.length` (3–8). The status already reads "of {melody.length}".

#### 6.6 CSS — `src/styles.css`

- `.app__toolbar { display: flex; justify-content: flex-end; margin-bottom: 0.5rem }`; `.settings-button`: 2.75 rem square touch target, accent border like `.button`, font-size 1.5rem, disabled style shared with `.button:disabled`.
- `.note-boxes` (line ~189): replace the 5-column grid with `display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem`; `.note-box` gets `flex: 0 0 var(--note-box-size); width: var(--note-box-size)` with `--note-box-size: clamp(3.75rem, 15vw, 4.25rem)` (keep `aspect-ratio: 1`, font rules). Box size never depends on the melody length. Result: desktop (40 rem column) fits 8 in one row; 375 px fits 5 per row (8 → 5 + 3); 320 px fits 4 per row (8 → 4 + 4); no horizontal scroll.
- `.settings-dialog`: `width: min(32rem, calc(100% - 2rem))`, `max-height: calc(100dvh - 2rem)`, `overflow-y: auto`, `padding: 1.25rem`, `border: none`, `border-radius: 0.75rem`, `background: var(--color-bg)`, `color: var(--color-text)`; `::backdrop { background: rgb(0 0 0 / 0.45) }`. New `@media (max-width: 30rem)` block (next to the existing `@media (max-width: 24rem)` at line ~229, which stays): `width: 100%; max-width: 100%; margin: auto 0 0; border-radius: 0.75rem 0.75rem 0 0` (full width).
- `.setting` rows: label + value on one line (`display: flex; justify-content: space-between`), slider `width: 100%; accent-color: var(--color-accent)`; `.settings-dialog__footer`: flex, space-between; `.settings-dialog__hint`: `var(--color-muted)`.
- `.scale-combobox__input` full width, `min-height: 2.75rem`; `.scale-combobox__list` (in flow, `max-height: 15rem`, `overflow-y: auto`, border); `.scale-combobox__option[aria-selected="true"]` accent background; `.scale-combobox__option--empty` muted.

## UI Mockups

### Home (gear top-right)

```
┌────────────────────────────────────────┐
│                                  [ ⚙ ] │
│ Trumpet Trainer                        │
│ [ Start training ]                     │
│ [ Test microphone ]                    │
│ ████████░░░░░░░░|░░░░░░░░░░            │
│ −60 dB                Threshold: −35 dB│
└────────────────────────────────────────┘
```
While Start is opening the mic: `[ Start training ]`, `[ Test microphone ]` and `[ ⚙ ]` are disabled.

### Settings — Home mode (defaults)

```
┌──────────────── Settings ──────────────┐
│ Scale                                  │
│ [ Do major                         ▾ ] │
│ Melody length                 5 notes  │
│ ──────────●──────────────────          │
│ Max interval             12 semitones  │
│ ───────────────────●─────────          │
│ Note duration                1000 ms   │
│ ──────────────●──────────────          │
│ Playback volume                  50%   │
│ ──────────────●──────────────          │
│ [ Reset to defaults ]        [ Close ] │
└────────────────────────────────────────┘
```

### Scale combobox — open (focus), filtered, no matches

```
│ Scale                      │ Scale                      │ Scale                      │
│ [▮Do major              ]  │ [ bb major             ]   │ [ xyz                  ]   │
│ ┌────────────────────────┐ │ ┌────────────────────────┐ │ ┌────────────────────────┐ │
│ │ Chromatic              │ │ │▓Si♭ major             ▓│ │ │ No matching scales     │ │
│ │ All scales             │ │ │ Si♭ major pentatonic   │ │ └────────────────────────┘ │
│ │ All majors             │ │ └────────────────────────┘ │                            │
│ │ …                      │ │ Enter → "Si♭ major",       │ Esc → list closes, text    │
│ │▓Do major              ▓│ │ list closes                │ back to "Do major", dialog │
│ │ Sol major          ⇕   │ │                            │ stays open                 │
│ └────────────────────────┘ │                            │                            │
```

### Settings — after selecting "Do major pentatonic" with max interval 2

```
│ Scale            [ Do major pentatonic ] │
│ Max interval                3 semitones  │  ← raised to the scale minimum; slider min = 3
```

### Training — dialog open during playback (Training mode)

```
┌──────────────── Settings ──────────────┐
│ Note duration                 750 ms   │
│ ─────────●───────────────────          │
│ Playback volume                  80%   │  ← applied now, to the melody playing
│ ───────────────────────●─────          │
│ Other settings can be changed on the   │
│ home screen.                           │
│ [ Reset to defaults ]        [ Close ] │
└────────────────────────────────────────┘
(behind the backdrop: "Listen…", boxes and progress unchanged; listening continues)
```

### Training — 8 notes, phone width (two rows)

```
┌──────────────────────────────┐
│                        [ ⚙ ] │
│ Your turn: play note 6 of 8  │
│ [Sol4][ Do5][ Mi4][ Re4][ La4]│
│      [▣   ][    ][    ]      │
│ [ Repeat melody ]            │
│ [ Give up ]                  │
└──────────────────────────────┘
```

### Mobile — dialog full width

```
┌──────────────────────────────┐
│ (dimmed screen)              │
├────────── Settings ──────────┤
│ … controls, full width …     │
│ [ Reset to defaults ][ Close ]│
└──────────────────────────────┘
```

## Acceptance Criteria — Part 2

**Gear and dialog**
- [ ] A button named "Settings" is visible on Home and on Training; it is disabled while Start is in progress.
- [ ] Clicking it opens a modal dialog named "Settings"; Close, and Esc (with the scale list closed), close it and focus returns to the gear.
- [ ] Home mode shows Scale, Melody length, Max interval, Note duration, Playback volume with the documented limits, steps, visible values and `aria-valuetext`.
- [ ] Training mode shows only Note duration and Playback volume and the text "Other settings can be changed on the home screen."
- [ ] Every change calls `onChange` immediately and is saved to storage; there is no Save button.
- [ ] Reset to defaults restores all five settings on Home and only note duration and volume on Training; the threshold is never changed.
- [ ] Selecting a scale whose minimum exceeds the current max interval raises it; the Max interval slider's `min` equals `minMaxInterval(scaleId)`.

**Scale combobox**
- [ ] Closed, the input shows the selected option name; focus opens all 146 options in the documented order with the current one active.
- [ ] Typing filters with `searchScaleOptions`; "bb major" shows Si♭ major then Si♭ major pentatonic; no results show a non-selectable "No matching scales".
- [ ] ArrowUp/Down move the active option (clamped), Enter or click selects, closes the list and shows the name; Escape with the list open closes only the list and reverts the text; blur reverts.
- [ ] ARIA: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role="listbox"`, `role="option"`, `aria-selected`.

**Training**
- [ ] Start generates the exercise with the current length, max interval and scale; the number of boxes equals the melody length (3–8); names follow the scale's key signature (chromatic: contextual).
- [ ] Playback uses the current note duration and volume; a volume change while playing calls `setVolume` once on the running playback and does not replay; no `setVolume` when idle.
- [ ] A note-duration change applies on the next Repeat; neither change restarts the exercise or changes progress; listening continues while the dialog is open.
- [ ] Repeat replays the same notes (a group does not pick a new scale).
- [ ] 8 boxes wrap onto two centered rows at 375 px and 320 px without horizontal scroll and without shrinking; 8 fit on one row at desktop width.

**Persistence**
- [ ] Settings and threshold are restored after a reload; a group is restored as the group.
- [ ] Missing, blocked (throwing) or invalid storage → defaults, and the app is fully usable.

## Technical Requirements — Part 2

### 7.1 E2E melody hook — `src/testing/testMelody.ts`

- `parseTestMelody(search)` accepts **`MIN_MELODY_LENGTH`..`MAX_MELODY_LENGTH`** (3–8) integers in the written range (was exactly `MELODY_LENGTH`); the URL length overrides the Melody length setting.
- New `getTestExercise(scaleId: ScaleOptionId): Exercise | null`: `getTestMelody()` → `null` if absent; otherwise `{ notes, scale }` where `scale` = the selected specific scale (`resolveScaleMembers` returns a single member and `scaleId` is a `scale` option) or `'chromatic'` for Chromatic and for groups (so names use the contextual `spellMelody`, as in the MVP).
- Update `testMelody.test.ts`: lengths 3 and 8 valid, 2 and 9 invalid; `getTestExercise` with `major:do`, `major:fa` (Si♭ spelling of 70), `group:all` and `chromatic`.

### 7.2 Test infrastructure

- **`src/test/setup.ts`:** jsdom 25 does not implement `HTMLDialogElement.prototype.showModal`/`close` (its `HTMLDialogElement-impl.js` is empty; it does reflect `open` and hides `dialog:not([open])`). Add a guarded stub: `showModal()` → `this.open = true`; `close()` → if open: `this.open = false` and dispatch `new Event('close')`. Esc is simulated with `user.keyboard('{Escape}')` (the dialog's `onKeyDown` path), not the native `cancel`.
- **`src/test/appTestUtils.tsx`:** `renderApp(fake = createFakeAudioServices(), { storage = createFakeStorage() }: { storage?: Storage | null } = {})` renders `<App storage={storage} />` and also returns `storage`; `boxStates()` counts the rendered `note-box-*` elements instead of using `MELODY_LENGTH`; add `openSettings()` (clicks "Settings").
- `src/test/sessionDriver.ts`: unchanged.

### 7.3 E2E — new `e2e/settings.spec.ts`

Use `page.addInitScript` to seed `localStorage` only in tests that need seeded data (it reruns on reload, so not in the persistence test). Range inputs are set with `locator.fill('<value>')`.
1. **Home dialog:** gear → dialog "Settings" with the five controls at defaults ("Do major", "5 notes", "12 semitones", "1000 ms", "50%"); Esc closes; reopen; Close closes.
2. **Persistence:** set note duration 750, volume 80, melody length 8, scale via typing "bb major" + Enter, move the threshold slider → reload → all values restored, `localStorage['trumpet-trainer.settings.v1']` parses to the expected object.
3. **Combobox:** type "bb major" → options "Si♭ major", "Si♭ major pentatonic"; Esc → list gone, dialog still open, input "Do major"; type "f# dorian" + Enter → "Fa# dorian".
4. **Training mode, no restart:** `/?melody=71,71,71,60,60` → Start → wait for boxes 0–2 `done`, box 3 `active` → open Settings → only "Note duration" and "Playback volume" sliders plus the hint → change both → Close → boxes 0–2 still `done`, box 3 `active`, status "play note 4 of 5".
5. **8 boxes:** viewport 375×812, `/?melody=71,71,71,71,71,71,71,71` → Start → 8 boxes; box 5 is below box 0 (two rows), all boxes equal width, `document.documentElement.scrollWidth <= innerWidth`; Give up returns Home.
6. **Invalid storage:** init script sets the settings key to `'{oops'` and the threshold key to `'"abc"'` → Home works, dialog shows defaults, threshold label "Threshold: −40 dB".

Existing `e2e/training.spec.ts` and `e2e/mic-meter.spec.ts` need no URL changes (5-note `?melody=` stays valid, 71 → Si4 and 60 → Do4 in Do major); playback now takes ~5 s instead of ~2.5 s, which fits the 15 s per-box timeout and the 6 s wait.

## Testing Decisions

TDD: write each failing test first, co-located `*.test.ts(x)`. Unit tests are table-driven; components render through `AudioServicesProvider` with `createFakeAudioServices()` and `vi.useFakeTimers({ shouldAdvanceTime: true })`, async steps in `act`.

| File | Status | Covers |
|---|---|---|
| `src/music/scales.test.ts` | new | 146 options, unique ids, order; 15 tonics per type (tonic table); key signatures; pitch classes; `largestStep`, `minMaxInterval`; `resolveScaleMembers`; `isScaleOptionId`; every search-table row |
| `src/music/spelling.test.ts` | update | every `spellInKey` worked example incl. fallbacks; `spellExercise` branches; existing `spellMelody` cases kept |
| `src/music/melody.test.ts` | rewrite | `scaleCandidates` (Do major = 11 notes, chromatic = 19); `pickIndex` bounds; worked example; scripted rng call counts (group +1 first); seeded property test over all ids × lengths × intervals |
| `src/config/settings.test.ts` | new | `DEFAULT_SETTINGS`; `selectScale` raise/never lower; `resetSettings` scopes; `normalizeSettings` table; `parseThreshold` |
| `src/config/settingsStorage.test.ts` | new | round-trip with `createFakeStorage`; missing key; invalid JSON; `null`; `createThrowingStorage` for load and save; `getBrowserStorage` with a throwing `window.localStorage` getter → `null` |
| `src/config/constants.test.ts` | update | removed/added constants |
| `src/audio/synth.test.ts` | update | master gain = volume, envelopes peak 1 (replaces 0.25), `setVolume` ramp events via `src/test/fakeWebAudio.ts`, no-op after stop and after natural end |
| `src/audio/services.test.ts`, `src/test/fakeAudioServices.test.ts` | update | options forwarding; `volume`, `volumeChanges` |
| `src/training/trainingReducer.test.ts` | update | `createInitialTrainingState(exercise)` names via key (e.g. Fa major) and chromatic |
| `src/training/useTrainingSession.test.tsx` | update | `renderHook` with `initialProps`; play call has duration/volume; `rerender` with new volume while playing → one `volumeChanges` entry, `playCalls` length 1; volume change while listening → none; duration change → next Repeat uses it; progress kept |
| `src/components/SettingsDialog.test.tsx` | new | modes; live `onChange` per control; reset scopes; max-interval min follows scale; Esc/Close call `onClose`; Esc in open combobox does not |
| `src/components/ScaleCombobox.test.tsx` | new | open on focus, order, filtering, arrows, Enter, click, Escape, blur, no matches, ARIA attributes |
| `src/components/settingsText.test.ts` | new | formatter strings incl. "1 semitone" |
| `src/components/App.test.tsx` | update | mock `generateExercise` returning `{ notes: MELODY, scale: 'chromatic' }` (keeps the existing names, since 54 and 66 are not in Do major); play call `{ …, noteDurationMs: DEFAULT_NOTE_DURATION_MS, volume: DEFAULT_VOLUME, volumeChanges: [] }`; replace "no localStorage" with threshold persisted to the fake storage; new: settings round-trip across remount, seeded storage changes the generated length/boxes, throwing and `null` storage still work, gear disabled while starting, dialog in Training mode keeps progress |
| `src/testing/testMelody.test.ts` | update | see 7.1 |
| `e2e/settings.spec.ts` | new | see 7.3 |

Adapters stay thin: `getBrowserStorage` and `playSequence` are covered by focused tests with fakes plus e2e and the manual checklist.

## Risks

- **Chromium close-request abuse protection:** a second Esc without user activation may close a dialog even though `cancel` was prevented. Mitigated by syncing the native `close` event back to `onClose()`.
- **Clipping at 100 % volume:** a full-scale sawtooth through the low-pass can overshoot slightly; acceptable for a reference tone, checked manually.
- **Default changes alter feel:** slower, louder, Do major, ≤ octave leaps; existing tests and e2e timings must be updated (listed above).
- **Stale stored data:** future fields or ranges are protected by per-field normalization and the versioned key.

## Out of Scope

- Mic threshold inside the panel (it is only persisted); tolerance, sustain time, note range, transposition, A4 reference, detection and synth internals (stay constants).
- Tonic rules or note weighting inside a scale; other scale types (harmonic/melodic minor, blues, …).
- Internationalization; English note display (English names only work as search aliases).
- New runtime dependencies; CI/CD workflow changes.

## Future Considerations

- More settings (tolerance, sustain, range, transposition) can be added as `Settings` fields with defaults; `normalizeSettings` already tolerates missing fields, so the `v1` key keeps working.
- The scale catalog is data-driven: new types are new rows in the type table.

## `CLAUDE.md` Updates

- Intro: replace "No backend, no accounts, no persistence" with "No backend, no accounts; settings and the mic threshold are saved in `localStorage`". Mention the Settings panel (gear) and configurable length/tempo/volume/max interval/scale.
- Specs list: add `specs/in-app-configuration/idea.md`, `prd.md`, `prd2.md`; Status: in-app configuration implemented.
- Architecture tree: add `src/music/scales.ts`, `src/config/settings.ts`, `src/config/settingsStorage.ts` (ADAPTER), `src/components/SettingsButton.tsx`, `SettingsDialog.tsx`, `ScaleCombobox.tsx`, `settingsText.ts`, `src/test/fakeStorage.ts`, `e2e/settings.spec.ts`; update descriptions of `spelling.ts` (`spellInKey`, `spellExercise`), `melody.ts` (`generateExercise`, `Exercise`), `synth.ts` (`setVolume`), `App.tsx` (settings + storage), `testMelody.ts` (3–8 notes).
- Conventions: `App` receives `storage: Storage | null` (from `getBrowserStorage()` in `main.tsx`); only `settingsStorage.ts` touches `localStorage`; settings rules live in pure `settings.ts`; `setup.ts` stubs `HTMLDialogElement.showModal/close` for jsdom; `?melody=` accepts 3–8 notes and is spelled in the selected specific scale's key; fake `PlayCall` records `volume` and `volumeChanges`.

## Manual Validation Checklist

- [ ] Desktop Chrome, Firefox, iOS Safari, Android Chrome: gear opens the dialog; on phones it is full width and scrolls if needed.
- [ ] Moving the volume slider during playback changes the loudness immediately without clicks; 0 % is silent.
- [ ] Note duration 250 ms and 1500 ms sound right after Repeat.
- [ ] A Fa major melody shows Si♭; a Sol♭ major melody may show Do♭; a group picks different keys across exercises.
- [ ] 8-note exercise: boxes in two rows on a phone, one row on desktop.
- [ ] Reload restores everything; a private window (or blocked storage) still works with defaults.
