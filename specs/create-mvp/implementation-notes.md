# create-mvp Trumpet Trainer MVP

# Implementation notes

# prd.md implementation

## Requirements

Implements Part 1 of the MVP (`specs/create-mvp/prd.md`): the project scaffold, the constants, the music domain and the audio domain with its adapter contracts. The training session, UI, e2e specs and CI belong to `prd2.md`.

| Requirement | Status |
|---|---|
| Stack (Vite 5, React 18, TS 5 strict, pitchy 4) and dev dependencies | Implemented. `jsdom` is pinned to v25 because v27 needs a newer Node than 20.16 |
| package.json scripts (`dev`, `dev:e2e`, `build`, `preview`, `test`, `test:watch`, `generate:tones`, `test:e2e`, `lint`, `typecheck`) | Implemented. `test:e2e` adds `--pass-with-no-tests` (see Known issues) |
| `vite.config.ts` (base `/trumpet-trainer/` on build and preview, jsdom, setup file, `src/**/*.test.{ts,tsx}` only, `restoreMocks`) | Implemented. Preview base fixed later (see Fixes) |
| `tsconfig.json` (strict), `eslint.config.js` (flat), `index.html`, `.env.e2e`, `.gitignore` | Implemented |
| `playwright.config.ts` + `scripts/generate-test-tones.mjs` | Implemented (fake-mic flags, webServer `dev:e2e`; 440 Hz, 4 s, 48 kHz 16-bit mono WAV) |
| `src/config/constants.ts`: every constant in the PRD table | Implemented and value-tested. Extra helper constants were added (see Implementation details) |
| `notes.ts`: `WRITTEN_RANGE`, `isInWrittenRange`, `writtenToConcert`, `midiToHz`, `centsFrom`, `noteName`, types | Implemented |
| `spelling.ts`: `spellMelody` with all 7 worked examples | Implemented |
| `melody.ts`: `generateMelody` with injected rng | Implemented |
| `level.ts`: `computeLevelDb` (never NaN/−Infinity) | Implemented |
| `pitchDetector.ts`: pitchy wrapper with range/clarity filtering | Implemented (±5 cents on sine and sawtooth at 164.81, 440, 466.16 Hz; null for silence, noise, 100 Hz, 800 Hz) |
| `sustainTracker.ts`: clock-injected sustain rule | Implemented; all reference cases pass |
| `audioContext.ts`: shared lazy singleton + `unlockAudio` | Implemented |
| `synth.ts`: `playSequence` with brass-ish timbre, `done`, `stop()` | Implemented |
| `microphone.ts`: `openMicrophone`, `MicrophoneError`, frame loop | Implemented |
| `services.ts` + `AudioServicesContext.tsx` | Implemented |
| `src/main.tsx` | Implemented with a placeholder `App` inside `AudioServicesProvider`. prd2 replaces the App |
| CLAUDE.md / README.md | Created |

## Initial considerations

- The repo was greenfield (only spec files), so the pre-flight health check had nothing to run.
- The PRD expects `npm run test:e2e` to pass, but the e2e specs come in prd2. Playwright 1.63 has no `passWithNoTests` config option, so the script uses the CLI flag instead.
- prd2's testing section says the thin adapters are covered only by e2e and manual checks. Unit tests with mocked Web Audio, `getUserMedia` and `requestAnimationFrame` were still added for their contract-level behaviour: the constraints, error mapping, scheduling and idempotency.
- Node on the dev machine is 20.16. `jsdom` was pinned to v25 for compatibility. `eslint-visitor-keys@5` prints an EBADENGINE warning (it wants Node ≥ 20.19), but lint works anyway.

## Design

Pure core and thin adapters, with one injection seam:

```
            components (prd2)
                  │ useAudioServices()
                  ▼
  AudioServicesProvider ◄── createBrowserAudioServices() (main.tsx) / fakes (tests)
                  │
   AudioServices { unlock, openMicrophone, playMelody, detectPitch }
        │              │                │             │
  audioContext.ts  microphone.ts    synth.ts    pitchDetector.ts ── pitchy
   (singleton)    (rAF frames)   (osc→gain→LPF→master)
                                   
Pure: config/constants · music/{notes,spelling,melody} · audio/level · training/sustainTracker
```

- A melody is stored as **written** MIDI numbers (54–72). It is converted to concert pitch (−2 semitones) only at the audio boundaries: synth frequencies and the detection target.
- The sustain tracker works on the timestamps inside each frame, not wall-clock timers, so it is deterministic in tests.

## Implementation details

- **`src/config/constants.ts`:** contains every PRD constant plus these helpers:
  - `SEMITONES_PER_OCTAVE`, `CENTS_PER_OCTAVE`, `MS_PER_SECOND`, `DB_PER_DECADE`
  - `SYNTH_STOP_FADE_MS` (20)
  - `SYNTH_DONE_FALLBACK_MARGIN_MS` (200)
  
  The only literals left elsewhere are structural 0/1 and the `−1` octave offset in `noteName`.
- **`src/music/notes.ts`:** the solfège tables for sharp and flat spellings use `#` (U+0023) and `♭` (U+266D). The octave is `floor(m/12) − 1`.
- **`src/music/spelling.ts`:**
  - Notes after the first get their accidental from the direction of the step from the previous note; a repeated note keeps the previous accidental.
  - The first note follows the direction to the first note that differs from it, defaulting to sharp.
- **`src/music/melody.ts`:** returns `54 + min(18, floor(rng()·19))`, calling `rng` exactly `length` times.
- **`src/audio/pitchDetector.ts`:**
  - Caches one `PitchDetector.forFloat32Array(len)` per buffer length in a module-level `Map`.
  - `findPitch` returns `[0, 0]` for silence; this, non-finite values, out-of-range values (150–500 Hz) and clarity below 0.9 all map to `null`. An empty buffer also returns `null`.
  - No level gating happens here; the caller does it.
- **`src/training/sustainTracker.ts`:** tracks the start of the current run and the last target. A target change, or a frame that doesn't qualify, resets the run.
- **`src/audio/audioContext.ts`:**
  - Creates the context lazily, falling back to `webkitAudioContext`.
  - `unlockAudio()` resumes the context when it is suspended, using `.catch(() => undefined)` to avoid unhandled rejections. It must be called synchronously inside click handlers.
- **`src/audio/synth.ts`:**
  - **Graph:** a sawtooth oscillator per note → a per-note envelope gain → a shared low-pass filter → master gain → destination.
  - **Scheduling:** notes play back to back starting at `currentTime + 50 ms`.
  - **`done`:** has a single resolver guarded by a flag. It resolves on whichever comes first: the last oscillator's `ended` event, the fallback `setTimeout` (`50 ms + n·d + 200 ms`, measured from the call), or `stop()`.
  - **`stop()`:** cancels the master gain and holds it, ramps it to 0 over 20 ms, stops every oscillator, resolves `done` immediately and disconnects the graph after the fade. It is idempotent.
- **`src/audio/microphone.ts`:**
  - **Opening:** calls `getUserMedia` with echo cancellation, noise suppression and AGC turned off. The source feeds an `AnalyserNode` with `fftSize` 2048, which is never connected to the destination.
  - **Frame loop:** the `requestAnimationFrame` loop runs only while at least one listener is subscribed, and it reuses a single `Float32Array` buffer.
  - **Error mapping:** `NotAllowedError`/`SecurityError` → `permission-denied`; no `mediaDevices.getUserMedia` → `unsupported`; anything else → `unknown`, with `cause` kept. If building the graph fails after access is granted, the tracks are stopped and the call rejects with `unknown`.
  - **`release()`** is idempotent, and `subscribe()` after release is a no-op.
- **`src/audio/services.ts`:** `createBrowserAudioServices()` wires the adapters together. It does not create the `AudioContext` eagerly.
- **`src/audio/AudioServicesContext.tsx`:** contains the provider and a `useAudioServices()` hook that throws outside the provider. It needs one `react-refresh/only-export-components` eslint-disable comment.
- **`scripts/generate-test-tones.mjs`:** builds the WAV (RIFF/PCM) using only Node built-ins. The signal is a 440 Hz sine at about −9 dBFS that loops seamlessly.
- **`playwright.config.ts`:** Chromium is launched with `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, `--use-file-for-fake-audio-capture=e2e/fixtures/tone-a4-440hz.wav` and an autoplay flag. It uses one worker, retries in CI and keeps traces on failure.
- **`src/components/App.tsx`:** a placeholder heading, to be replaced in prd2.

## Tests

There are 196 Vitest tests in 13 files, all passing:

| File | Tests | Covers |
|---|---|---|
| `src/config/constants.test.ts` | 28 | Every PRD value |
| `src/music/notes.test.ts` | 45 | Range, transposition, Hz, signed cents, all 12 pitch classes × 2 accidentals |
| `src/music/spelling.test.ts` | 17 | All 7 worked-example rows (table-driven) and each rule |
| `src/music/melody.test.ts` | 10 | Stub-rng mapping, call count, bounds, rng returning 1 |
| `src/audio/level.test.ts` | 8 | 0 / −20 / −3.01 dB, zeros and empty → −100, clamping |
| `src/audio/pitchDetector.test.ts` | 28 | Sine and saw at 3 pitches × 2 sample rates (±5 c); nulls for silence, seeded noise, 100 Hz, 800 Hz |
| `src/training/sustainTracker.test.ts` | 15 | All reference cases, target change, reset, inclusive edges |
| `src/audio/audioContext.test.ts` | 5 | Singleton, webkit fallback, resume only when suspended |
| `src/audio/synth.test.ts` | 12 | Graph, back-to-back schedule, envelope, `done`, fallback, idempotent stop |
| `src/audio/microphone.test.ts` | 19 | Constraints, fftSize, no feedback, error mapping, frame loop, release |
| `src/audio/services.test.ts` | 5 | Wiring, no eager context |
| `src/audio/AudioServicesContext.test.tsx` | 3 | Provider and hook, throws without provider |
| `src/components/App.test.tsx` | 1 | Placeholder renders |
| `src/config/viteConfig.test.ts` | 4 | Resolved `base` for dev, e2e dev, build and preview (node environment; added by the preview-base fix) |

The helpers are `src/test/signals.ts` (sine, sawtooth, mulberry32 seeded noise) and `src/test/fakeWebAudio.ts` (recording fakes for AudioParam, Gain, Biquad, Oscillator and AudioContext). There are no e2e specs yet; they come in prd2. A temporary Playwright smoke run showed that the fake mic opens with the raw constraints and reads the WAV at about −9 dBFS.

## Documentation updates

- `CLAUDE.md` (new): overview, stack, commands, architecture (pure core / thin adapters / injection seam), file layout, conventions.
- `README.md` (new): what the app is, requirements, how to run dev, tests, build and e2e, and the note that the microphone needs a secure context.

## Performance

- Pitch detectors are cached per buffer length, so nothing is reallocated per frame.
- The microphone reuses one sample buffer and only runs its rAF loop while it has listeners.
- The production bundle is about 155 kB (50 kB gzip).

## Known issues

- `test:e2e` uses `--pass-with-no-tests` until prd2 adds specs; the flag can be dropped then. The `e2e/` folder holds only the gitignored fixture, so git doesn't track it yet.
- Some behaviour can only be verified in a real browser:
  - the synth's sound and envelope
  - the `ended` event actually firing
  - iOS Safari unlock
  - a single `AudioContext` per page load
  - a real permission prompt and denial
- EBADENGINE warning for `eslint-visitor-keys@5` on Node 20.16. It's harmless; CI (prd2) uses Node 22.

---

# prd2.md implementation

## Requirements

Implements Part 2 of the MVP (`specs/create-mvp/prd2.md`): the training state machine, the session hook, the UI, the e2e hook and specs, the fake audio services, and CI/CD.

| Requirement | Status |
|---|---|
| `trainingReducer` (4 transitions, every other pair returns the same reference), `selectNoteBoxes`, `selectCanAct` | Implemented |
| `useTrainingSession` (per-phase effects, detector skipped below threshold, mic kept on Repeat, Give up, completion pause, unmount) | Implemented |
| `App` Start handler (sync `unlock()`, release test mic, open mic, error kinds, melody from `getTestMelody() ?? generateMelody()`) | Implemented. Step 2 runs inside `flushSync` (see Initial considerations) |
| `HomeScreen`, `micErrorMessage` (exact strings) | Implemented |
| `MicLevelMeter` (toggle with `aria-pressed`, meter role/aria values, overlaid threshold slider −60…0 step 1, release on late open) | Implemented |
| `TrainingScreen`, `NoteBox` (status line, 5 boxes, Repeat and Give up disabled unless listening) | Implemented |
| Threshold kept in memory across Home → Training → Home, never in storage | Implemented and tested (Storage spies never called) |
| `src/testing/testMelody.ts` (`parseTestMelody`, `getTestMelody` gated on `VITE_E2E`) | Implemented |
| `src/test/fakeAudioServices.ts` | Implemented as specified, with a self-test |
| `playwright.config.ts` | Already matched the PRD from Part 1; unchanged |
| `e2e/training.spec.ts`, `e2e/mic-meter.spec.ts` | Implemented; 3 specs pass |
| `test:e2e` without `--pass-with-no-tests` | Done |
| `.github/workflows/ci.yml` (check, e2e, deploy gated on `vars.DEPLOY_BRANCH \|\| 'main'`) | Implemented |
| Constants | All needed values already existed; none added |

## Initial considerations

- **`flushSync` in Start:** setting `testMicActive = false` normally commits after the handler continues. Without `flushSync`, the second `openMicrophone()` would run before `MicLevelMeter`'s cleanup released the test session. A call-order test covers this, and a mutation check confirmed the test fails without `flushSync`.
- **Give up during playback:** §4.2 says Give up stops playback immediately, but §5.4 disables the button whenever `!canAct`. The button follows §5.4. `giveUp()` still stops playback, and that path is tested at hook level.
- **NoteBox `aria-label`:** the PRD wording "{pending|active|done name}" was read as "Note 1: pending", "Note 1: active" and "Note 1: done Si4".
- **StrictMode:** `main.tsx` renders in StrictMode, so dev and e2e builds mount effects twice. The hook was made safe for that (see Implementation details).

## Design

```
App (screen, thresholdDb, testMicActive, startError, starting)
 ├─ HomeScreen ── MicLevelMeter (own test MicrophoneSession while active)
 └─ TrainingScreen ── useTrainingSession(melody, mic, thresholdDb, onExit)
                        ├─ useReducer(trainingReducer)   playing → guard → listening ⟲ → complete
                        ├─ one SustainTracker per session
                        └─ effects keyed on phase:
                             playing   → playMelody(concert Hz, 500 ms); done → playbackEnded
                             guard     → setTimeout 250 ms → guardElapsed
                             listening → mic.subscribe per active note → noteMatched
                             complete  → setTimeout 1500 ms → release mic, onExit
```

- `App` owns the `MicrophoneSession` for training and passes it down. The session is released by the hook on Give up, on completion, and on unmount.
- Frames are only subscribed in `listening`, so frames during playback and the guard are never seen.

## Implementation details

- **`src/training/trainingReducer.ts`:** a pure switch that returns `state` unchanged for every ignored pair. `names` is computed once with `spellMelody`.
- **`src/training/useTrainingSession.ts`:**
  - The tracker is created once with `useState(() => createSustainTracker({ thresholdDb }))`. It is reset when each `playing` phase starts and after each match.
  - The listening effect depends on `[phase, matchedCount]`. Each subscription has a local `matched` flag, so frames that arrive before React re-renders can't produce two matches, and one long hold over repeated notes can't count twice.
  - The playing effect uses a `cancelled` flag for stale `done` promises. Its cleanup calls `stop()` only if the playback hasn't settled, which in practice means only on unmount.
  - `exit()` is guarded so the mic release and `onExit` happen once.
  - The unmount release is deferred by a microtask and skipped if the component remounted, which happens with StrictMode's synchronous unmount/remount.
- **`src/components/App.tsx`:** the screen union plus threshold, test-mic, error and starting state. The Start handler follows §5.1: `unlock()` before any `await`, then `flushSync` for step 2.
- **`src/components/MicLevelMeter.tsx`:** the effect opens a session while `active`. If `open` resolves after deactivation, the session is released immediately. The meter value is clamped to [−60, 0]. The range input is overlaid on the bar with a transparent track, and its thumb is the threshold marker.
- **`src/components/NoteBox.tsx` / `TrainingScreen.tsx`:** the boxes are an `<ol>` of `<li>` with `data-testid`, `data-state` and `aria-label`. The status line uses `data-testid="training-status"`.
- **`src/styles.css`:**
  - Boxes: pending is grey, active is grey with a 5 px accent border, done is green.
  - Meter: the fill turns green at or above the threshold.
  - Layout: a responsive grid, with buttons stacked on narrow screens. Checked at 375 px and 900 px.
- **`src/testing/testMelody.ts`:** accepts only exactly `MELODY_LENGTH` decimal integers within the written range.
- **`src/test/fakeAudioServices.ts`, `src/test/appTestUtils.tsx`:** the fakes from the PRD, plus `renderApp` and `act`-wrapped helpers (`click`, `finishPlayback`, `elapse`, `toListening`, `hold`).
- **`src/test/setup.ts`:** now registers RTL `cleanup`. Vitest runs without `globals`, so rendered trees were leaking between tests.
- **`.github/workflows/ci.yml`:** jobs `check`, `e2e` (uploads `playwright-report/` on failure) and `deploy` (Pages, `environment: github-pages`, concurrency group `pages`).

## Tests

There are 302 Vitest tests in 20 files (up from 196 in 13), all passing, plus 3 Playwright specs.

| File | Tests | Covers |
|---|---|---|
| `src/training/trainingReducer.test.ts` | 32 | Initial state, the 4 transitions, all 12 ignored pairs (same reference), selectors |
| `src/training/useTrainingSession.test.tsx` | 19 | Phase effects, below-threshold detector skip, Repeat sustain reset, Give up during playback, StrictMode survival, unmount release |
| `src/testing/testMelody.test.ts` | 19 | Valid, wrong length, out of range, non-numeric, decimal, hex, empty item; env gate via `vi.stubEnv` |
| `src/components/micErrorMessage.test.ts` | 3 | Exact strings |
| `src/test/fakeAudioServices.test.ts` | 5 | Fake behaviour (`emitTone` level, `failNextMicrophone`, `finishPlayback`/`stop`) |
| `src/components/App.test.tsx` | 21 | Every Home/microphone and Training-flow acceptance criterion, including 500 ms and 1500 ms boundaries (±1 ms) |
| `src/components/MicLevelMeter.test.tsx` | 5 | Toggle, meter value, slider, rejection, late open |
| `src/components/NoteBox.test.tsx` | 3 | States, test id, aria-label |
| `e2e/training.spec.ts` | 2 | Matching melody completes and returns Home; non-matching melody never advances, then Give up |
| `e2e/mic-meter.spec.ts` | 1 | Meter rises above −40 with the fake tone and resets to −60 |

Not covered automatically (manual checklist): real trumpet detection, the synth's sound, iOS unlock, and the browser's mic indicator.

## Documentation updates

- `CLAUDE.md`:
  - Status updated to say both parts are implemented.
  - Architecture list now includes the new files.
  - `test:e2e` row updated.
  - New conventions: fake services and `appTestUtils`, RTL cleanup, StrictMode-safe effects, the `?melody=` hook, deploy branch.
- `README.md`: added "How it works", e2e notes, and "CI and deployment" (Pages source "GitHub Actions", `DEPLOY_BRANCH`, base path). Removed the work-in-progress note.
- `specs/create-mvp/create-environment.sh`: also starts an e2e-mode dev server on port 5174 for the deterministic `?melody=` flow.

## Performance

- One mic subscription per active note. Detection is skipped for frames below the threshold.
- The production bundle is about 163 kB (53 kB gzip), up from about 155 kB.

## Known issues

- e2e depends on Chromium's fake audio capture. It was stable across 3 local runs, and CI has `retries: 2`. The non-matching spec always waits 6 s, as the PRD specifies.
- In dev and e2e (StrictMode), the meter calls `getUserMedia` twice when it is turned on and releases the first session as soon as it resolves. The first `playMelody` is also started and stopped right away, before any sound. Production is not affected.
- The pressed "Test microphone" button and "Start training" use the same accent colour. This is cosmetic.
- Deploy needs a one-time manual setup: enable Pages with source "GitHub Actions", and either create `main` or set the repository variable `DEPLOY_BRANCH`. The current default branch is `claude/pensive-fermi-pxuyo0`.
- `npm run test:e2e` needs port 5173 free. Stop `create-environment.sh` first.
- The EBADENGINE warning on Node 20.16 from Part 1 is still printed locally.

## Fixes

### Production preview served at `/` instead of `/trumpet-trainer/` (validation P1-6, P2-17)

- **Root cause:** `vite.config.ts` set `base: '/trumpet-trainer/'` only when `command === 'build'`. `vite preview` resolves the config with `command === 'serve'` and `isPreview === true`, so the preview server mounted the build at `/`. `index.html` in `dist/` references `/trumpet-trainer/assets/...`, which 404ed, and the app never rendered at http://localhost:4173/trumpet-trainer/. The GitHub Pages build was not affected.
- **Fix:** `vite.config.ts` now destructures `isPreview` and uses `command === 'build' || isPreview`. The dev servers (`dev`, `dev:e2e`) still serve at `/`.
- **PRD:** `prd.md` § vite.config.ts gained an addendum, and Acceptance Criteria — Part 1 gained a preview criterion.
- **Test:** `src/config/viteConfig.test.ts` (4 table-driven cases). It uses `// @vitest-environment node` because importing the config loads esbuild, whose `TextEncoder` invariant fails under jsdom.
- **Verified:** `npm run build` + `npm run preview`. The page renders at `/trumpet-trainer/`, and `assets/index-*.js` and `.css` return 200.

### Two dev servers share the dependency cache and load two copies of React (validation P2-9 to P2-16)

- **Root cause:** `create-environment.sh` runs the normal dev server (5173) and the e2e-mode server (5174) at the same time, right after `npm ci` has emptied `node_modules/.vite`. Both servers used the default `cacheDir`, and both computed the same optimizer hash: Vite puts `process.env.NODE_ENV` (`development` for both) into the hash in place of `mode`. Each server pre-bundled the dependencies on its own and committed the result to the same `deps/` folder. The other server's in-memory metadata then pointed at chunks that had been replaced. A page could load `react` from one run and `react-dom` from the other, and crashed with `Cannot read properties of null (reading 'useContext')`. Which server broke was random, and reloading did not help.
- **Fix:** `vite.config.ts` sets `cacheDir: 'node_modules/.vite-e2e'` when `mode === 'e2e'`. Other modes keep the default. `dev:e2e` (Playwright) uses the same separate cache. The script and `package.json` are unchanged.
- **PRD:** `prd.md` § vite.config.ts gained an "e2e cache dir" addendum, and Acceptance Criteria — Part 1 gained a matching criterion.
- **Test:** `src/config/viteConfig.test.ts` gained a `cacheDir` table (development → default, e2e → `node_modules/.vite-e2e`, build → default).
- **Verified:** emptied both caches, started `vite` and `vite --mode e2e` at the same time, and loaded both pages and reloaded the first. Both rendered with no console errors, and the caches were separate (`node_modules/.vite/deps` and `node_modules/.vite-e2e/deps`). Unit tests: 21 files, 309 tests pass. Lint and typecheck are clean.

## Tech-debt fixes (/t-review #1)

All 12 TODO items in `specs/create-mvp/review.md` (2 warnings, 10 suggestions) are fixed and checked off. Each testable item got a failing test first.

### Warnings

- **Test microphone could be re-enabled while Start was pending** (`App.tsx`, `HomeScreen.tsx`, `MicLevelMeter.tsx`):
  - `MicLevelMeter` takes an optional `disabled` prop for its toggle, and `HomeScreen` passes `starting`.
  - As a second safeguard, Start step 4 calls `setTestMicActive(false)` together with `setScreen(...)`, so going back Home can never reopen the test mic without a click.
  - Test (`App.test.tsx`): with `openMicrophone` pending, the toggle is disabled and a click doesn't press it. After the open resolves and the user clicks Give up, the toggle is unpressed and enabled, and `openMicrophone` was called only once.
- **No Web Audio threw synchronously** (`audioContext.ts`, `services.ts`):
  - `getAudioContext()` now throws the new `WebAudioUnsupportedError`.
  - `unlockAudio()` returns early (no-op) when there is no context and no constructor.
  - `createBrowserAudioServices().openMicrophone` is now `async` and creates the context through `getMicrophoneContext()`. A `WebAudioUnsupportedError` becomes `MicrophoneError('unsupported')`; any other constructor failure becomes `MicrophoneError('unknown')`. Both keep `cause`. The call rejects instead of throwing in the caller, so `MicLevelMeter`'s `.then(…, onRejected)` and `App`'s `await` both show the "unsupported" message.
  - The conversion lives in `services.ts` and not in `microphone.ts`, because `openMicrophone(ctx)` receives an existing context (PRD signature unchanged). The "microphone path" test is therefore in `services.test.ts`.
  - Tests: `audioContext.test.ts` has a "without Web Audio support" block (`unlockAudio` doesn't throw; `getAudioContext` throws `WebAudioUnsupportedError`). `services.test.ts` covers the rejection with "unsupported" (never a synchronous throw, adapter not called) and with "unknown" for other failures. Its `./audioContext` mock now spreads `importOriginal` so the error class is real.

### Suggestions

- **Meter re-rendered every frame** (`MicLevelMeter.tsx`): the subscription stores `toDisplayDb(level) = Math.round(clamp(level))` and calls `setLevelDb` only when that value changes, tracked in a closure variable per subscription. A plain `useState` bail-out wasn't enough: React still re-rendered once per frame after an update. The bar, `aria-valuenow` and the threshold colour all use the stored whole-dB value. A level such as −40.4 dB therefore counts as −40 for the meter colour (±0.5 dB display tolerance); training gating still uses the raw level. Test: a `Profiler` counts commits, and −30.1/−30.2/−29.9 and −95/−100 add no extra commits.
- **A throwing listener froze the frame loop** (`microphone.ts`): the listener loop is wrapped in `try { … } finally { re-arm rAF }`. The error still propagates (the browser reports it). Test: "keeps the frame loop running when a listener throws".
- **Per-frame allocations** (`microphone.ts`):
  - One `MicFrame` (`{ timeMs, samples }`) is allocated per session and updated in place.
  - The listener `snapshot` array is rebuilt only in `subscribe`, a real unsubscribe and `release()`. It is replaced, not mutated, so changes made during a frame take effect from the next frame (same semantics as the old per-frame copy).
  - `MicFrame`'s doc comment now says the whole frame is reused. Both consumers (`useTrainingSession`, `MicLevelMeter`) destructure the frame synchronously, and `SustainTracker.push` gets a fresh `PitchFrame`, so nothing retains frames.
  - The existing frame test now records `timeMs` at call time. New tests: "reuses one frame object across frames", "a listener subscribed or unsubscribed during a frame takes effect from the next frame".
- **Duplicate alerts** (`MicLevelMeter.tsx`, `HomeScreen.tsx`, `App.tsx`): the test-mic error is lifted into `App` (`testMicError`), passed down through `HomeScreen` (`testMicError` / `onTestMicErrorChange`) and into `MicLevelMeter` (`error` / `onErrorChange`). The meter still sets the error on rejection and clears it when turned on. Start clears it inside the same `flushSync` as `startError`. Resetting it "when `active` turns off" would not have worked, because after a rejection the toggle is already off. Tests (`App.test.tsx`): a denied test mic followed by a denied Start shows exactly one alert; a test-mic error is gone after a successful Start → Give up. The `MicLevelMeter.test.tsx` harness now owns the error state.
- **Return types:** `App`, `HomeScreen`, `MicLevelMeter`, `TrainingScreen`, `NoteBox` and `AudioServicesProvider` declare `: JSX.Element`.
- **Duplicated test helpers:** the new `src/test/sessionDriver.ts` exports `FRAME_MS`, `LOUD_DB`, `concertHz` and `createSessionDriver(fake, startTimeMs = 0)`, which returns the `act`-wrapped `finishPlayback`, `elapse`, `toListening` and `hold`, with a frame clock per driver. `renderApp` spreads a driver. `useTrainingSession.test.tsx` creates one per `setup()` (start time 1000 ms, as before) and delegates to it. `App.test.tsx` imports `concertHz` / `FRAME_MS` from `sessionDriver.ts`.
- **`boxStates`** uses `Array.from({ length: MELODY_LENGTH }, …)`.
- **`renderApp`** no longer returns `user`.
- **Missing component test files (intentional deviation):** the PRD file tree lists `src/components/HomeScreen.test.tsx` and `src/components/TrainingScreen.test.tsx`. They were not created: every HomeScreen and TrainingScreen acceptance criterion is exercised through `App` in `src/components/App.test.tsx`, which already renders both screens with the fake services. Separate files would only duplicate those tests.
- **CI permissions:** `.github/workflows/ci.yml` has a top-level `permissions: contents: read`. `deploy` keeps its own Pages block.

### Tests

There are 320 Vitest tests in 21 files (up from 309), all passing. The 11 new tests are: `App.test.tsx` +3, `MicLevelMeter.test.tsx` +1, `audioContext.test.ts` +2, `services.test.ts` +2, `microphone.test.ts` +3. The new helper `src/test/sessionDriver.ts` has no test file of its own; it is covered by the App and hook suites. Lint, typecheck and build are clean (JS 163.2 kB, 53.5 kB gzip), and `npm run test:e2e` passes 3 of 3.

### Documentation

- `CLAUDE.md`: the `audioContext.ts` line notes the no-op/unsupported behaviour, the `src/test/` line lists `sessionDriver.ts`, the microphone convention says `MicFrame` is reused, and the component-test convention points to `sessionDriver.ts`.
- `validation.md`: Appendix A (steps 20-32).

### Known issues

- **Pre-existing flake:** `App.test.tsx` › "after the 5th match … after 1500 ms mic released and Home shown" fails now and then. It failed 1 run in 6 on the unchanged code (checked with `git stash`) and about as often after these fixes. The cause is that `vi.useFakeTimers({ shouldAdvanceTime: true })` also advances the fake clock with real time (in 20 ms steps), so the `COMPLETE_PAUSE_MS - 1` boundary check can see the timer fire early. These changes didn't touch it. Fixing it needs either fake timers that don't advance on their own for the boundary tests, or a looser boundary.
