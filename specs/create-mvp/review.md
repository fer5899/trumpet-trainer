# Code Review: Trumpet Trainer MVP

## Summary

**Pass with notes.** The implementation meets every functional requirement and acceptance criterion in `prd.md` and `prd2.md`. It follows the CLAUDE.md conventions closely: a pure core, thin adapters, a single injection seam, written→concert conversion only at the audio boundaries, and StrictMode-safe effects. There are no critical issues. There are two warnings: a Start/Test-microphone race that can leave the test mic switched on, and an unhandled synchronous throw when the browser has no Web Audio support. The rest are small suggestions.

## PRD Compliance

| Requirement | Source | Status | Notes |
|---|---|---|---|
| Stack: Vite 5, React 18, TS 5 strict, pitchy 4, the listed dev dependencies, no UI framework, router or state library | prd.md | OK | `package.json`, `tsconfig.json` (`strict`, `noUnusedLocals`). jsdom pinned to v25; this is documented. |
| package.json scripts (dev, dev:e2e, build, preview, test, test:watch, generate:tones, test:e2e, lint, typecheck) | prd.md | OK | Match the table exactly. |
| vite.config: base `/trumpet-trainer/` for build and preview, `/` for dev; jsdom; setup file; `src/**` only; restoreMocks | prd.md | OK | `vite.config.ts:10-19`. Tested in `viteConfig.test.ts`. |
| e2e mode has its own `cacheDir` | prd.md | OK | `vite.config.ts:12`. Tested. |
| index.html, .env.e2e, .gitignore entries | prd.md | OK | All present. |
| All constants in `constants.ts` with the PRD values | prd.md | OK | Extra helper constants are documented. Only structural 0/1/100 literals appear elsewhere. |
| `WRITTEN_RANGE` (19 entries), `isInWrittenRange`, `writtenToConcert` | prd.md | OK | `notes.ts:18-28` |
| `midiToHz`, signed `centsFrom` | prd.md | OK | `notes.ts:30-37` |
| `noteName`: solfège, `#`/`♭`, octave numbering | prd.md | OK | `notes.ts:39-49`. All 12 pitch classes × 2 accidentals are tested. |
| `spellMelody` rules plus the worked examples | prd.md | OK | Table-driven tests. |
| `generateMelody`: injected rng, exactly `length` rng calls | prd.md | OK | `melody.ts:10-15` |
| `computeLevelDb`: dBFS clamped to [-100, 0], never NaN or -Infinity | prd.md | OK | `level.ts:6-18` |
| `detectPitch`: range and clarity filter | prd.md | OK | Tests cover sine and saw at 164.81, 440 and 466.16 Hz, plus silence, noise and out-of-range inputs. |
| Sustain tracker rules 1-6 and the reference cases | prd.md | OK | Includes the exact 500 ms boundary. |
| `getAudioContext` singleton with webkit fallback; `unlockAudio` resumes | prd.md | Issue | Throws synchronously when Web Audio is missing, and the click handlers don't catch it (see Warnings). |
| `playSequence`: graph, schedule, envelope, `done` resolved once, idempotent `stop()` | prd.md | OK | `synth.ts`. Fully unit-tested. |
| `openMicrophone`: raw constraints, error mapping, `fftSize` 2048, analyser not connected to destination, rAF loop, `release()` | prd.md | OK | `microphone.ts` |
| `AudioServices` / provider / hook that throws without a provider | prd.md | OK | `services.ts`, `AudioServicesContext.tsx` |
| One AudioContext per page | prd.md | OK | Module singleton, unit-tested. |
| Reducer: 4 transitions; every other pair returns the same reference | prd2.md | OK | All ignored pairs are tested. |
| `selectNoteBoxes` / `selectCanAct` | prd2.md | OK | `trainingReducer.ts:56-67` |
| Hook, `playing` phase: tracker reset, concert-Hz playback, `playbackEnded` | prd2.md | OK | `useTrainingSession.ts:67-92` |
| Hook, `guard` phase: 250 ms timer, cleared on cleanup | prd2.md | OK | `useTrainingSession.ts:95-99` |
| Hook, `listening` phase: per-note subscription, threshold gating, mic kept on Repeat | prd2.md | OK | `useTrainingSession.ts:102-117` |
| Hook, `complete` phase: 1500 ms, then release and `onExit` | prd2.md | OK | `useTrainingSession.ts:120-124` |
| Hook, unmount cleanup (StrictMode-safe) | prd2.md | OK | Release deferred by a microtask; documented and tested. |
| Give up stops playback (§4.2) versus buttons disabled unless `canAct` (§5.4) | prd2.md | OK | The PRD contradicts itself. The deviation is documented in the implementation notes. |
| App Start handler sequence | prd2.md | Issue | Steps are correct, but the Test microphone toggle stays enabled while `starting` (see Warnings). |
| HomeScreen: h1, Start, `role="alert"` error, MicLevelMeter | prd2.md | OK | `HomeScreen.tsx` |
| `micErrorMessage` exact strings | prd2.md | OK | Tested. |
| MicLevelMeter toggle, meter ARIA, overlaid threshold slider | prd2.md | OK | `MicLevelMeter.tsx:37-119` |
| Threshold kept in memory only, across screens | prd2.md | OK | Tested with Storage spies. |
| TrainingScreen status texts, 5 NoteBoxes, buttons gated on `canAct` | prd2.md | OK | `TrainingScreen.tsx` |
| NoteBox testid, state, aria-label, visuals | prd2.md | OK | `NoteBox.tsx` |
| E2E melody hook: validated, gated on `VITE_E2E === 'true'` | prd2.md | OK | `testMelody.ts`. Strict regex plus range check. |
| `fakeAudioServices` contract | prd2.md | OK | Has its own self-test. |
| playwright.config and the tone fixture | prd2.md | OK | Adds an HTML reporter on CI so the failure artifact has content. |
| E2E specs: training (matching and non-matching), mic meter | prd2.md | OK | Follow the PRD steps. |
| CI: check, e2e, deploy gated on `vars.DEPLOY_BRANCH \|\| 'main'` | prd2.md | OK | `.github/workflows/ci.yml` |
| Component test files `HomeScreen.test.tsx`, `TrainingScreen.test.tsx` (PRD file tree) | prd2.md | Issue | Missing. Behaviour is covered via `App.test.tsx`, but the implementation notes don't record the deviation (see Suggestions). |

## TODO: Critical Issues (must fix)

None

## TODO: Warnings (should fix)

- [ ] **src/components/App.tsx:43-44 / src/components/MicLevelMeter.tsx:82-89 / src/components/HomeScreen.tsx:35-40** — The "Test microphone" toggle stays enabled while `starting` is true. Start sets `testMicActive = false`, but a click during the pending `openMicrophone()` (for example while the permission prompt is open) sets it back to `true`. Step 4 then switches screens without resetting it, so when the user returns Home, MicLevelMeter remounts with `active` and reopens the mic with no click. That breaks the IDEA §5.5 expectation that the mic is released on Home. Fix:
  - Pass `starting` through HomeScreen and use it as the toggle's `disabled` prop, and/or call `setTestMicActive(false)` alongside `setScreen(...)` in step 4.
  - Add an App test: click Test microphone while `openMicrophone` is pending, complete Start, Give up, then assert the toggle is unpressed and no new session was opened.
- [ ] **src/audio/audioContext.ts:7-11,27-28** — On browsers without Web Audio support, `resolveConstructor()` throws a plain `Error`. `unlockAudio()` calls it synchronously from click handlers:
  - In `App.handleStart` (invoked as `() => void handleStart()`), the throw becomes an unhandled promise rejection and no message is shown.
  - In `MicLevelMeter.handleToggle`, it is an uncaught exception.

  Fix:
  - Make `unlockAudio()` a no-op when no constructor exists.
  - Make the `getAudioContext()` path inside `openMicrophone` reject with `new MicrophoneError('unsupported')` instead of a generic `Error`, so the UI shows the "unsupported" message.
  - Add an `audioContext.test.ts` case with neither `AudioContext` nor `webkitAudioContext` defined.

## TODO: Suggestions (nice to have)

- [ ] **src/components/MicLevelMeter.tsx:50** — `setLevelDb(computeLevelDb(samples))` runs on every animation frame (about 60 renders per second) even though the displayed value is rounded (`:97`). Store the rounded, clamped value and skip the update when it hasn't changed.
- [ ] **src/audio/microphone.ts:89-93** — If a listener throws, `onFrame` never re-arms `requestAnimationFrame`, so detection freezes silently. Wrap the listener loop in `try { … } finally { re-arm }`.
- [ ] **src/audio/microphone.ts:89-90** — Each frame allocates a new `MicFrame` and a copy of the listener array (`[...listeners]`). Reuse one frame object, and rebuild a listener snapshot only in `subscribe` and its unsubscribe.
- [ ] **src/components/MicLevelMeter.tsx:31,120-124** — The meter keeps its own `error` state, which is cleared only when the toggle is pressed again. After a denied test mic followed by a denied Start, two `role="alert"` elements with the same text show at once. Clear the meter error when Start is pressed: lift it into App, or reset it when the parent turns `active` off.
- [ ] **src/components/App.tsx:15, HomeScreen.tsx:15, MicLevelMeter.tsx:28, TrainingScreen.tsx:27, NoteBox.tsx:10, src/audio/AudioServicesContext.tsx:11** — Exported function components have no explicit return types. Add `: JSX.Element` to match the explicitly typed hooks and adapters.
- [ ] **src/training/useTrainingSession.test.tsx:17-61** — These lines re-implement the `src/test/appTestUtils.tsx` helpers almost verbatim (`FRAME_MS`, `LOUD_DB`, `concertHz`, `finishPlayback`, `elapse`, `toListening`, `hold`). Extract the shared frame and clock helpers into `src/test/` and use them from both files.
- [ ] **src/test/appTestUtils.tsx:72-73** — `boxStates` hard-codes `[0, 1, 2, 3, 4]`. Use `Array.from({ length: MELODY_LENGTH }, …)`.
- [ ] **src/test/appTestUtils.tsx:38** — `renderApp` returns `user`, but no test uses it. Remove it.
- [ ] **specs/create-mvp/implementation-notes.md** — The PRD file tree lists `src/components/HomeScreen.test.tsx` and `src/components/TrainingScreen.test.tsx`, which don't exist; their criteria are covered in `App.test.tsx`. Either add thin component tests or record the consolidation as an intentional deviation.
- [ ] **.github/workflows/ci.yml:1-7** — There is no workflow-level `permissions:` block, so `check` and `e2e` inherit the repository's default token permissions. Add a top-level `permissions: { contents: read }` (the `deploy` job keeps its own block).

## Technical Debt Assessment

**Neutral.** This is a greenfield MVP built with deliberately low debt:

- All decision logic is in small pure modules with table-driven tests.
- Browser APIs sit behind one `AudioServices` seam that has a well-specified fake.
- Magic numbers are centralised in `constants.ts`.
- There is no `any`, and the two casts (`audioContext.ts:8`, `microphone.ts:43`) are narrow and justified.
- There is no dead production code.
- StrictMode double-mounting, late-resolving opens and idempotent release are each handled and tested.

The debt this branch does introduce:

- Duplicated test helpers between `useTrainingSession.test.tsx` and `appTestUtils.tsx`.
- Per-frame re-renders in the mic meter.
- Two error-handling gaps: the toggle race and the missing-Web-Audio throw.

None of these blocks the MVP.

## Files Reviewed

- `.env.e2e`, `.gitignore`, `index.html`, `README.md` — OK.
- `.github/workflows/ci.yml` — matches the PRD; no top-level `permissions` block.
- `eslint.config.js`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `package.json` — match the PRD.
- `scripts/generate-test-tones.mjs` — correct RIFF/PCM header; Node built-ins only.
- `e2e/training.spec.ts`, `e2e/mic-meter.spec.ts` — follow the PRD scenarios.
- `src/config/constants.ts`, `viteConfig.test.ts` — complete.
- `src/music/notes.ts`, `spelling.ts`, `melody.ts` (+ tests) — correct.
- `src/audio/level.ts`, `pitchDetector.ts` (+ tests) — correct and robust against NaN.
- `src/audio/audioContext.ts` — unsupported-browser throw (Warning).
- `src/audio/synth.ts` — correct; disconnects after the fade.
- `src/audio/microphone.ts` — raw constraints, no destination connection, tracks stopped; the frame loop is fragile if a listener throws (Suggestion).
- `src/audio/services.ts`, `AudioServicesContext.tsx` — clean injection seam.
- `src/training/sustainTracker.ts`, `trainingReducer.ts`, `useTrainingSession.ts` (+ tests) — correct and StrictMode-safe.
- `src/testing/testMelody.ts` — strict validation; env-gated.
- `src/components/App.tsx` — toggle race (Warning).
- `src/components/HomeScreen.tsx`, `TrainingScreen.tsx` — match the PRD; no co-located tests.
- `src/components/MicLevelMeter.tsx` — re-renders every frame; can show a duplicate alert.
- `src/components/NoteBox.tsx`, `micErrorMessage.ts` (+ tests) — OK.
- `src/main.tsx`, `src/styles.css`, `src/vite-env.d.ts` — OK.
- `src/test/*` — solid helpers; some duplication with the hook test and one unused return value.

## Verification

Run on 2026-10-03, branch `create-mvp`:

| Command | Result |
|---|---|
| `npm test` | 21 files, 309 tests passed |
| `npm run lint` | Clean (no output) |
| `npm run typecheck` | Clean |
| `npm run build` | Succeeded (JS 162.6 kB, 53.3 kB gzip) |

E2E (`npm run test:e2e`) was not run as part of this review.
