# Trumpet Trainer MVP - Product Requirements Document (Part 2 of 2)

> Continuation of `specs/create-mvp/prd.md` (Part 1), which defines the overview, goals, implementation decisions, scaffold, file tree, constants (`src/config/constants.ts`), music domain (`WrittenMidi`, `Melody`, `spellMelody`, `generateMelody`, `writtenToConcert`, `midiToHz`) and audio domain (`detectPitch`, `computeLevelDb`, `createSustainTracker`, `MicrophoneSession`, `MicrophoneError`, `Playback`, `AudioServices`). Read Part 1 first. Behavior source of truth: `specs/create-mvp/IDEA.md`.
> **Greenfield note:** all paths below are proposed new paths.

## Core Features — Part 2

### 4. Training session

#### 4.1 State machine — `src/training/trainingReducer.ts` (pure)

```ts
export type TrainingPhase = 'playing' | 'guard' | 'listening' | 'complete';
export interface TrainingState {
  phase: TrainingPhase;
  melody: Melody;                 // written MIDI, length MELODY_LENGTH
  names: readonly string[];       // spellMelody(melody), computed once
  matchedCount: number;           // 0..melody.length; also the active index while < length
}
export type TrainingAction =
  | { type: 'playbackEnded' }
  | { type: 'guardElapsed' }
  | { type: 'noteMatched' }
  | { type: 'repeatRequested' };
export type NoteBoxState = 'pending' | 'active' | 'done';
export interface NoteBoxView { state: NoteBoxState; name: string | null }

export function createInitialTrainingState(melody: Melody): TrainingState; // phase 'playing', matchedCount 0
export function trainingReducer(state: TrainingState, action: TrainingAction): TrainingState;
export function selectNoteBoxes(state: TrainingState): NoteBoxView[];
export function selectCanAct(state: TrainingState): boolean;            // phase === 'listening'
```

Transitions (any other phase/action pair returns the **same object reference**, i.e. is ignored):

| From | Action | To |
|---|---|---|
| `playing` | `playbackEnded` | `guard` |
| `guard` | `guardElapsed` | `listening` |
| `listening` | `noteMatched` | `listening` with `matchedCount + 1`; `complete` if it reaches `melody.length` |
| `listening` | `repeatRequested` | `playing` (matchedCount unchanged) |

`selectNoteBoxes`: index `i < matchedCount` → `{ state: 'done', name: names[i] }`; `i === matchedCount` and phase ≠ `complete` → `{ state: 'active', name: null }`; otherwise `{ state: 'pending', name: null }`. The active highlight is visible in every non-complete phase (so progress is visible during Repeat). "Give up" is not a reducer action: it leaves the screen.

#### 4.2 Hook — `src/training/useTrainingSession.ts`

```ts
export interface UseTrainingSessionArgs { melody: Melody; mic: MicrophoneSession; thresholdDb: number; onExit: () => void }
export interface TrainingSessionView {
  state: TrainingState; boxes: NoteBoxView[]; canAct: boolean;
  repeat(): void;   // dispatches repeatRequested (no-op unless listening)
  giveUp(): void;   // stops playback, releases mic, calls onExit (allowed in any phase)
}
export function useTrainingSession(args: UseTrainingSessionArgs): TrainingSessionView;
```

Uses `useReducer(trainingReducer, melody, createInitialTrainingState)`, `useAudioServices()`, and one `createSustainTracker({ thresholdDb })` per session. Effects keyed on `state.phase`:

1. **Enter `playing`** (mount and after each Repeat): `tracker.reset()`; `playback = services.playMelody(melody.map(m => midiToHz(writtenToConcert(m))), NOTE_DURATION_MS)`; when `playback.done` resolves and the effect was not cleaned up → dispatch `playbackEnded`. Cleanup marks the effect cancelled (it does not stop playback, except on unmount/give up).
2. **Enter `guard`**: `setTimeout(LISTEN_GUARD_MS)` → `guardElapsed`; cleanup clears the timer.
3. **Enter/stay `listening`**: `mic.subscribe(frame => …)`; per frame: `levelDb = computeLevelDb(frame.samples)`; `hz = levelDb >= thresholdDb ? services.detectPitch(frame.samples, mic.sampleRate)?.hz ?? null : null` (detector is **not called** below threshold); target = `writtenToConcert(melody[matchedCount])`; if `tracker.push({ timeMs: frame.timeMs, hz, levelDb }, target)` → `tracker.reset()` and dispatch `noteMatched`. Cleanup unsubscribes. Frames are therefore ignored in `playing`/`guard`/`complete`. The mic session is **not** released on Repeat.
4. **Enter `complete`**: `setTimeout(COMPLETE_PAUSE_MS)` → `mic.release()`, `onExit()`.
5. **Unmount**: stop any active playback, `mic.release()` (idempotent), clear timers.

Edge cases: wrong pitch, wrong octave, below-threshold or unclear frames → nothing happens (tracker just never matches). Repeat pressed while not listening → ignored (button is also disabled). Give up during playback → playback stopped immediately.

### 5. UI

#### 5.1 `App` — `src/components/App.tsx`

React state (memory only, nothing persisted):

```ts
type Screen = { name: 'home' } | { name: 'training'; melody: Melody; mic: MicrophoneSession };
// plus: thresholdDb (default DEFAULT_THRESHOLD_DB), testMicActive: boolean,
//       startError: MicrophoneErrorKind | null, starting: boolean
```

**Start training** handler, in order:
1. `services.unlock()` synchronously (before any `await`).
2. `startError = null`, `testMicActive = false` (MicLevelMeter releases the test session on commit), `starting = true`.
3. `await services.openMicrophone()`. On rejection: `startError = err instanceof MicrophoneError ? err.kind : 'unknown'`, `starting = false`, stay on Home (Start enabled again for retry). No melody is generated, nothing is played.
4. On success: `melody = getTestMelody() ?? generateMelody()`; `screen = { name: 'training', melody, mic }`; `starting = false`.

`onExit` from TrainingScreen → `screen = { name: 'home' }` (threshold kept). Errors are cleared on the next Start.

#### 5.2 `HomeScreen` — `src/components/HomeScreen.tsx`

Props: `{ onStart(): void; starting: boolean; startError: MicrophoneErrorKind | null; thresholdDb: number; onThresholdChange(db: number): void; testMicActive: boolean; onTestMicActiveChange(active: boolean): void }`. Renders: `<h1>Trumpet Trainer</h1>`, button **"Start training"** (disabled only while `starting`), inline error `role="alert"` with `micErrorMessage(startError)` when set, and `<MicLevelMeter>`.

`micErrorMessage(kind)` — `src/components/micErrorMessage.ts` (pure):
- `permission-denied`: "Microphone access is blocked. Allow the microphone for this site (usually via the icon in the address bar or your browser's site settings), then press Start training again."
- `unsupported`: "This browser can't access the microphone. Use an up-to-date Chrome, Firefox, Safari or Edge over HTTPS."
- `unknown`: "Couldn't start the microphone. Check that one is connected and not used by another app, then try again."

#### 5.3 `MicLevelMeter` — `src/components/MicLevelMeter.tsx`

Props: `{ active: boolean; onActiveChange(active: boolean): void; thresholdDb: number; onThresholdChange(db: number): void }`.
- Toggle `<button aria-pressed={active}>Test microphone</button>`. Click when off: `services.unlock()` synchronously, then `onActiveChange(true)`; click when on: `onActiveChange(false)`.
- Effect while `active`: `openMicrophone()`; subscribe and set `levelDb = computeLevelDb(samples)` per frame. On rejection: show `role="alert"` with `micErrorMessage(kind)` and call `onActiveChange(false)`. Cleanup (inactive or unmount): unsubscribe + `release()`; if the open resolves after deactivation, release immediately.
- Level bar: `role="meter"`, `aria-label="Microphone level"`, `aria-valuemin={-60}`, `aria-valuemax={0}`, `aria-valuenow` = level clamped to [−60, 0] (−60 when inactive). Fill width `(clamped + 60) / 60 · 100%`; fill uses a "ok" color when `level >= thresholdDb`, neutral otherwise.
- Threshold slider overlaid on the same bar: `<input type="range" aria-label="Threshold" min={-60} max={0} step={1}>` (constants), value `thresholdDb`; always enabled; label shows e.g. "Threshold: −40 dB". Change → `onThresholdChange(Number(value))`.

#### 5.4 `TrainingScreen` and `NoteBox`

`TrainingScreen` props: `{ melody: Melody; mic: MicrophoneSession; thresholdDb: number; onExit(): void }`; uses `useTrainingSession`. Renders a status line `data-testid="training-status"` ("Listen…" in `playing`, "Get ready…" in `guard`, "Your turn: play note {matchedCount+1} of 5" in `listening`, "Well done!" in `complete`), 5 `NoteBox`es, and buttons **"Repeat melody"** (`disabled={!canAct}`) and **"Give up"** (`disabled={!canAct}`).

`NoteBox` props: `{ index: number; state: NoteBoxState; name: string | null }`; renders `data-testid="note-box-{index}"`, `data-state={state}`, `aria-label` "Note {index+1}: {pending|active|done name}". Visual: pending = grey; active = grey + thick highlighted border; done = green with `name` text.

## UI Mockups

### Home — mic test off (default)
```
┌──────────────────────────────────────────┐
│  Trumpet Trainer                         │
│                                          │
│  [ Start training ]                      │
│                                          │
│  [ Test microphone ]  (off)              │
│  ░░░░░░░░░░░░░░░░░░░░│░░░░░░░░░░░░░░░░░  │
│  −60 dB              ▲ Threshold: −40 dB │
└──────────────────────────────────────────┘
```
### Home — mic test on, user playing above threshold
```
│  [■ Test microphone ]  (on, aria-pressed)│
│  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇│▇▇▇▇▇▇▇░░░░░░░░░░  │  fill green: level −22 dB ≥ −40
│  −60 dB              ▲ Threshold: −40 dB │
```
### Home — microphone permission denied
```
│  [ Start training ]                      │
│  ⚠ Microphone access is blocked. Allow   │
│    the microphone for this site (...),   │
│    then press Start training again.      │
```
### Training — playing (buttons disabled)
```
┌──────────────────────────────────────────────┐
│  Listen…                                     │
│  ┏━━━━┓ [    ] [    ] [    ] [    ]          │
│  ┃    ┃  grey   grey   grey   grey           │
│  ┗━━━━┛                                      │
│  [ Repeat melody ](disabled) [ Give up ](dis)│
└──────────────────────────────────────────────┘
```
### Training — listening, partial progress (2 of 5 done)
```
│  Your turn: play note 3 of 5                 │
│  [Fa#3] [Do#4] ┏━━━━┓ [    ] [    ]          │
│  green  green  ┃    ┃  grey   grey           │
│                ┗━━━━┛ ← active               │
│  [ Repeat melody ]        [ Give up ]        │
```
### Training — complete (1.5 s, then Home)
```
│  Well done!                                  │
│  [Fa#3] [Do#4] [Do#4] [Si♭3] [Do5]           │
│  all green — buttons disabled                │
```

## Acceptance Criteria — Part 2

Training state machine
- [ ] Initial state: phase `playing`, matchedCount 0, names = `spellMelody(melody)`.
- [ ] Only the four transitions in §4.1 change state; every other action returns the same reference.
- [ ] 5th `noteMatched` leads to `complete`; `repeatRequested` keeps matchedCount.

Home / microphone
- [ ] Home shows "Start training", "Test microphone" (not pressed), a meter at −60 and a threshold slider at −40 with range −60…0 step 1.
- [ ] Toggling the test on opens one mic session; the meter reflects frame levels; toggling off releases it and the meter returns to −60.
- [ ] Threshold changes persist across Home → Training → Home within the page session; not stored anywhere else (no localStorage).
- [ ] Start while the test is on releases the test session and opens a new session before any playback.
- [ ] Mic rejected (`permission-denied`, `unsupported`, `unknown`) → stays on Home, shows the matching message in `role="alert"`, `playMelody` never called, Start enabled; a later successful Start clears the error.
- [ ] `unlock()` is called synchronously in the Start and Test-microphone click handlers.

Training flow
- [ ] After a successful Start the training screen shows 5 boxes, box 0 `active`, others `pending`, both buttons disabled, and `playMelody` called once with the 5 concert frequencies and 500 ms.
- [ ] Frames emitted during `playing` and during the 250 ms guard never cause a match.
- [ ] In `listening`, a correct pitch above threshold held ≥ 500 ms turns the active box `done` with its spelled name and makes the next box `active`.
- [ ] A wrong note, the right note in another octave, or the right note below threshold changes nothing.
- [ ] Repeat: buttons disabled, `playMelody` called again, completed boxes stay green, active index unchanged, sustain progress reset, listening resumes after playback + 250 ms; mic not released.
- [ ] Give up: playback stopped, mic released, Home shown.
- [ ] After the 5th match: all boxes green, buttons disabled, after 1500 ms the mic is released and Home is shown (without user action).

## Technical Requirements — Part 2

### E2E test hook — `src/testing/testMelody.ts`
- `parseTestMelody(search: string): WrittenMidi[] | null` — reads the `melody` query param (e.g. `?melody=71,71,71,71,71`); returns the array only if it has exactly `MELODY_LENGTH` integers all within the written range, else `null`.
- `getTestMelody(): WrittenMidi[] | null` — `import.meta.env.VITE_E2E === 'true' ? parseTestMelody(window.location.search) : null`. `VITE_E2E=true` is set only in `.env.e2e` (used by `npm run dev:e2e`), so production builds ignore the param.

### Fake adapters — `src/test/fakeAudioServices.ts`
`createFakeAudioServices()` returns `{ services: AudioServices, … }` with controls:
- `unlock`, `openMicrophone`, `playMelody`, `detectPitch` are `vi.fn` spies.
- `failNextMicrophone(kind)` makes the next `openMicrophone` reject with `new MicrophoneError(kind)`.
- `sessions: FakeMicrophoneSession[]` — each has `sampleRate` 48000, `released: boolean`, `listenerCount`, `emit(frame)`.
- `emitTone({ hz, levelDb, timeMs })` on the latest session: sets the value the fake `detectPitch` returns (`hz === null` → `null`, else `{ hz, clarity: 1 }`) and emits a 2048-sample frame filled with the constant `10 ** (levelDb / 20)` (so `computeLevelDb` returns `levelDb`).
- `playCalls` records `{ frequenciesHz, noteDurationMs }`; `finishPlayback()` resolves the latest `done`; `stop` is a spy that also resolves `done`.

### Playwright — `playwright.config.ts`
`testDir: 'e2e'`, `timeout: 30_000`, `expect.timeout: 10_000`, `retries: CI ? 2 : 0`, `workers: 1`, `trace: 'retain-on-failure'`, single project `chromium` (`devices['Desktop Chrome']`) with `launchOptions.args`: `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`, `--use-file-for-fake-audio-capture=<abs path to e2e/fixtures/tone-a4-440hz.wav>`, `--autoplay-policy=no-user-gesture-required`. `webServer: { command: 'npm run dev:e2e', url: 'http://localhost:5173', reuseExistingServer: !CI, timeout: 60_000 }`, `baseURL` the same URL.

### Tone fixture — `scripts/generate-test-tones.mjs`
Plain Node (no deps): writes `e2e/fixtures/tone-a4-440hz.wav` (creating the folder): RIFF/WAVE, PCM 16-bit, mono, 48 000 Hz, 4.0 s, 440 Hz sine, amplitude 0.5 (≈ −9 dBFS RMS). 4 s × 440 Hz = 1760 whole periods, so Chrome's default looping of the file is seamless. Concert A4 = written Si4 (MIDI 71). The file is gitignored and regenerated by `test:e2e`.

### E2E specs
- `e2e/training.spec.ts`: (1) `/?melody=71,71,71,71,71` → click Start → `note-box-0` is `active` and Repeat is disabled → all 5 boxes become `done` with text "Si4" (timeout 15 s) → "Start training" visible again. (2) `/?melody=60,60,60,60,60` (Do4 written ≠ fake tone) → after Start, wait 6 s → `note-box-0` still `active`, no box `done`; click Give up → Home.
- `e2e/mic-meter.spec.ts`: click Test microphone → meter `aria-valuenow` > −40 within 5 s → click again → `aria-valuenow` = −60.

### CI/CD — `.github/workflows/ci.yml`
- Triggers: `push` (all branches), `pull_request`. Node 22, `actions/setup-node` with npm cache, `npm ci`.
- Job `check`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Job `e2e`: `npx playwright install --with-deps chromium`, `npm run test:e2e`; upload `playwright-report/` as artifact on failure.
- Job `deploy`: `needs: [check, e2e]`; `if: github.event_name == 'push' && github.ref_name == (vars.DEPLOY_BRANCH || 'main')`; `permissions: { pages: write, id-token: write, contents: read }`; `environment: github-pages`; `concurrency: { group: pages, cancel-in-progress: false }`; steps: checkout, setup-node, `npm ci`, `npm run build`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3` (`path: dist`), `actions/deploy-pages@v4`.
- **Deploy branch note:** the repo's current default branch is `claude/pensive-fermi-pxuyo0`, not `main`. Either rename/create `main`, or set the repository variable `DEPLOY_BRANCH` to the desired branch. GitHub Pages must be enabled with source "GitHub Actions" (one-time manual repo setting).

## Testing Decisions

- **Unit (Vitest, node-like, no DOM needed):** `notes` (range, transposition, Hz, cents incl. octave, `noteName` for all 12 pitch classes × both accidentals), `spelling` (table-driven, every row of the Part 1 worked-example table plus each IDEA §5.3 rule in isolation), `melody` (stub rng sequences, bounds, length, rng call count), `level` (constant, sine, zeros, empty), `pitchDetector` (synthetic 2048-sample buffers at 48 kHz: sine and sawtooth at 164.81/440/466.16 Hz within ±5 cents; silence, seeded white noise, 100 Hz and 800 Hz → `null`), `sustainTracker` (all reference cases: exact 500 ms boundary, drift reset, null reset, below-threshold reset, octave mismatch, target change, `reset()`), `trainingReducer` (every transition and every ignored pair), `testMelody` (valid, wrong length, out of range, non-numeric), `micErrorMessage`.
- **Component (Vitest + jsdom + RTL + user-event) with `createFakeAudioServices()` and `vi.useFakeTimers({ shouldAdvanceTime: true })`:** App/HomeScreen render; MicLevelMeter toggle opens/releases a session, meter value follows `emitTone`, slider changes threshold; permission-denied/unsupported/unknown errors; training screen 5 boxes with first active and buttons disabled during playback; frames during playback/guard ignored; sustained correct tone (frames every 20 ms for ≥ 500 ms) turns box green with name and advances; wrong note / wrong octave / below threshold do nothing; Repeat keeps progress and resets sustain; Give up returns Home and releases mic; completion returns Home after 1500 ms. Async steps wrapped in `act`.
- **Patterns:** no real Web Audio in unit/component tests; adapters (`synth`, `microphone`, `audioContext`, `createBrowserAudioServices`) are covered by e2e + manual checklist only. Write tests first (TDD) for every pure module and for each acceptance criterion above.
- **E2E (Playwright, Chromium only):** fake media stream with the generated looping tone; deterministic melody via `?melody=` in the e2e dev build; generous timeouts and CI retries.

## Risks

- **Fake-mic e2e flakiness in CI** (timing, headless audio): mitigated by a looping integer-period tone, 15 s timeouts, `retries: 2`, single worker, traces on failure.
- **Low notes:** concert E3 ≈ 164.8 Hz needs enough periods per frame; `fftSize` must stay ≥ 2048.
- **iOS Safari:** the AudioContext must be created/resumed inside the click handler, before any `await`; otherwise playback is silent.
- **Phone speakers** are weak in the low register; low melody notes may be hard to hear (manual check).
- **HTTPS required** for `getUserMedia`: GitHub Pages provides it; `localhost` works for development, LAN IPs do not.
- **Room reverb / speaker tail** could trigger a match right after playback: covered by the 250 ms guard plus the 500 ms sustain requirement.

## Out of Scope

- Everything in IDEA §8: accounts, history, statistics, scoring; difficulty levels, configurable length/tempo; instrument/transposition choice; sheet music; rhythm; limiting intervals between notes.
- Live detected-note display or tuner, persisting the threshold, real trumpet samples, notation/transposition selectors, browsers other than Chromium in automated e2e.

## Future Considerations (IDEA §9)

- Live detected note + tuner (cents): `detectPitch`/`centsFrom` already expose the data.
- Mistake/attempt counter and time per exercise (new reducer actions).
- Progressive difficulty (range, max interval, keys, length): `generateMelody` already takes an injectable rng and length.
- Persist the threshold between visits.
- Scale-based melodies; realistic trumpet sound (swap the synth adapter behind `AudioServices.playMelody`).
- Transposition and notation selector (Latin/English) — `noteName` is the single naming point.
- Show the completed melody on a staff.

## Manual Validation Checklist (real trumpet)

Run on the deployed GitHub Pages URL on: desktop Chrome, desktop Firefox, iOS Safari, Android Chrome.
- [ ] First Start shows the browser permission prompt; denying it shows the inline message on Home; allowing it in site settings and pressing Start again works.
- [ ] Melody is audible through the device speakers, 5 distinct notes (repeated notes audible as separate attacks), no clicks, ~2.5 s total.
- [ ] The speaker playback never turns a box green (play nothing after Start: all boxes stay grey).
- [ ] Playing each note correctly and holding it ~0.5 s turns it green with the expected written name (check one up-going sharp and one down-going flat).
- [ ] Wrong note and same note an octave off do not turn the box green.
- [ ] Lowest (written Fa#3) and highest (written Do5) notes are detected.
- [ ] With the threshold set above the room noise (Test microphone shows noise below the marker) talking/room noise does not trigger detection; setting the threshold to 0 dB blocks detection entirely.
- [ ] Repeat melody replays and keeps progress; Give up returns Home; completing all 5 returns Home after a short pause.
- [ ] After returning Home the browser's microphone-in-use indicator turns off.
