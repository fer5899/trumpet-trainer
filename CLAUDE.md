# Trumpet Trainer

Frontend-only web app for B♭ trumpet ear training: it plays a random melody, listens through
the microphone while the user plays it back, and marks each note green once it is played in tune
(±25 cents) and held for 0.5 s. A Settings panel (gear, top right on every screen) configures the
scale (or scale group), melody length (3–8), max interval, note duration (tempo) and playback
volume. No backend, no accounts; settings and the mic threshold are saved in `localStorage`.

- Product source of truth: `specs/create-mvp/IDEA.md`
- Specs: `specs/create-mvp/prd.md` (Part 1: scaffold, constants, music + audio domain, adapters)
  and `specs/create-mvp/prd2.md` (Part 2: training state machine, hook, UI, e2e specs, CI/CD)
- Status: Parts 1 and 2 are implemented (full MVP: Home + Training screens, e2e specs, CI/CD to
  GitHub Pages).
- In-app configuration: `specs/in-app-configuration/idea.md` (source of truth), `prd.md` (Part 1:
  constants, scale catalog, spelling in key, exercise generator, settings model + storage adapter,
  synth volume) and `prd2.md` (Part 2: hook, Settings dialog, scale combobox, App wiring, `?melody=`
  3–8 notes, e2e). Status: both parts implemented.

## Stack

Vite 5, React 18 (function components + hooks), TypeScript 5 (`strict`), npm, ESM. Pitch detection
via `pitchy` v4 (McLeod Pitch Method). Vitest + jsdom + Testing Library for unit/component tests,
Playwright (Chromium, fake microphone) for e2e. ESLint flat config. Plain CSS in `src/styles.css`.
No UI framework, router or state library.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (http://localhost:5173) |
| `npm run dev:e2e` | Dev server in `e2e` mode (`VITE_E2E=true` from `.env.e2e`), port 5173 strict |
| `npm run build` | Production build to `dist/` (base `/trumpet-trainer/` for GitHub Pages) |
| `npm run preview` | Serve the build (http://localhost:4173/trumpet-trainer/) |
| `npm test` | Vitest, single run (`src/**/*.test.{ts,tsx}` only) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:scripts` | `node:test` unit tests for `scripts/release.mjs` |
| `npm run generate:tones` | Writes `e2e/fixtures/tone-a4-440hz.wav` (440 Hz, 4 s, 16-bit mono 48 kHz) |
| `npm run test:e2e` | Generates the tone, then `playwright test` (starts `dev:e2e` itself; stop any other server on 5173 first) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

First-time e2e setup: `npx playwright install chromium`.

## Architecture: pure core, thin adapters

Everything that decides something is a pure, deterministic function with injected time/randomness
and is unit-tested. Browser APIs are wrapped in thin adapters that contain no decisions.

```
src/config/constants.ts        all tunables (ranges, durations, tolerances, synth, fft size,
                               exercise-setting DEFAULT_/MIN_/MAX_ limits, storage keys)
src/config/settings.ts         pure Settings model: DEFAULT_SETTINGS, selectScale (raises
                               maxInterval to the scale minimum), resetSettings('all'|'training'),
                               normalizeSettings (field-by-field validation, off-step volume →
                               default), parseThreshold (off-step → default),
                               volumeToPercent / percentToVolume (gain ↔ slider %)
src/config/settingsStorage.ts  ADAPTER: getBrowserStorage, load/saveSettings, load/saveThreshold
                               on an injected Storage | null; never throws, invalid data → defaults
src/music/notes.ts             types (WrittenMidi, ConcertMidi, Melody, Accidental), range,
                               transposition, midiToHz, centsFrom, noteName (Latin solfège);
                               letter/accidental primitives NOTE_LETTERS, LETTER_PITCH_CLASSES,
                               SHARP_SIGN, FLAT_SIGN, alterSign (PITCH_CLASS_NAMES derived)
src/music/scales.ts            scale catalog generated from rules (9 types × 15 key signatures):
                               SPECIFIC_SCALES (135), SCALE_OPTIONS (146: chromatic, 10 groups,
                               135 scales), keySignatureAlters, getScaleOption, getSpecificScale,
                               resolveScaleMembers, largestStep, minMaxInterval (precomputed),
                               searchScaleOptions (solfège + English aliases, b/#; ranked: name
                               prefix, then word prefix, then substring, catalog order within)
src/music/spelling.ts          spellMelody: contextual sharps/flats (IDEA §5.3); spellInKey (key
                               signature, letter-based octave: Si#3 = 60); spellExercise
src/music/melody.ts            Exercise { notes, scale } (scale = specific scale or 'chromatic';
                               a group's picked member), scaleCandidates, pickIndex,
                               generateExercise(rng, { length, maxInterval, scaleId }): random walk
src/audio/level.ts             computeLevelDb: RMS in dBFS, clamped to [-100, 0]
src/audio/pitchDetector.ts     detectPitch: pitchy wrapper + range/clarity filtering
src/training/sustainTracker.ts clock-injected "held ±25 c for 500 ms" detector
src/audio/audioContext.ts      ADAPTER: single shared AudioContext + unlockAudio() (no-op without
                               Web Audio; services.openMicrophone then rejects 'unsupported')
src/audio/synth.ts             ADAPTER: playSequence(ctx, freqs, { noteDurationMs, volume }) →
                               Playback { done, stop(), setVolume() }; volume = master gain
src/audio/microphone.ts        ADAPTER: openMicrophone → MicrophoneSession, MicrophoneError
src/audio/services.ts          AudioServices interface + createBrowserAudioServices()
src/audio/AudioServicesContext.tsx  AudioServicesProvider + useAudioServices()
src/training/trainingReducer.ts  pure state machine playing → guard → listening → complete,
                               createInitialTrainingState(exercise) (names via spellExercise),
                               selectNoteBoxes, selectCanAct
src/training/useTrainingSession.ts  hook wiring reducer + tracker to AudioServices (effects keyed
                               on phase: play / guard timer / mic subscription / complete timer);
                               live noteDurationMs (read via ref when a playback starts) and
                               volume (volume effect → Playback.setVolume on the running playback)
src/testing/testMelody.ts      e2e hook: `?melody=` with 3–8 notes, only when VITE_E2E === 'true';
                               getTestExercise(scaleId) spells in the selected specific scale
src/components/App.tsx         root: Home ⇄ Training + SettingsDialog; props { storage }; settings
                               and threshold loaded from / saved to storage; Start handler
src/components/SettingsButton.tsx  gear button "Settings" (top right, disabled while starting)
src/components/SettingsDialog.tsx  modal <dialog> (always mounted, content only while open):
                               home mode = scale + 4 sliders, training mode = duration + volume +
                               hint; live onChange, Reset to defaults, Close; open prop owns closing
src/components/ScaleCombobox.tsx  APG combobox + listbox over searchScaleOptions (146 options)
src/components/settingsText.ts formatNoteDuration / formatVolume / formatMelodyLength /
                               formatMaxInterval (slider values and aria-valuetext)
src/components/HomeScreen.tsx  title, Start training, start error, MicLevelMeter
src/components/MicLevelMeter.tsx  Test microphone toggle, role="meter" bar + overlaid threshold slider
src/components/micErrorMessage.ts  MicrophoneErrorKind → user-facing text
src/components/TrainingScreen.tsx  status line, one NoteBox per note (3–8, wrapping rows),
                               Repeat melody / Give up
src/components/NoteBox.tsx     pending / active / done box (data-testid note-box-{i}, data-state)
src/main.tsx                   createRoot + <AudioServicesProvider services={createBrowserAudioServices()}>
                               + <App storage={getBrowserStorage()} />
src/test/                      setup.ts (jest-dom + RTL cleanup + HTMLDialogElement showModal/close
                               stubs for jsdom), signals.ts (sine/sawtooth/seeded
                               noise), fakeWebAudio.ts (recording Web Audio node fakes),
                               fakeAudioServices.ts (createFakeAudioServices), sessionDriver.ts
                               (FRAME_MS, LOUD_DB, concertHz, createSessionDriver: act-wrapped
                               finishPlayback/elapse/toListening/hold, shared by App and hook
                               tests), appTestUtils.tsx (renderApp(fake, { storage }) = driver +
                               click/startTraining/openSettings; boxStates counts rendered boxes),
                               fakeStorage.ts (createFakeStorage, createThrowingStorage),
                               scales.ts (requireSpecificScale: getSpecificScale or throw)
e2e/                           training.spec.ts, mic-meter.spec.ts, settings.spec.ts (dialog,
                               persistence, combobox, training mode, 8-box layout, invalid storage);
                               fake mic = looping 440 Hz tone
scripts/generate-test-tones.mjs  fake-mic WAV fixture (Node built-ins only)
scripts/release.mjs            release versioning: validate | release | notes (Node built-ins only)
vite.config.ts                 base (/ dev, /trumpet-trainer/ build+preview), e2e mode uses its own cacheDir
playwright.config.ts           Chromium with --use-fake-device/ui-for-media-stream + the WAV
.github/workflows/ci.yml       check (lint/typecheck/test/build), release-metadata (PRs), e2e,
                               release (version bump + tag + GitHub release), deploy to GitHub Pages
```

## Conventions

- **All tunables live in `src/config/constants.ts`** as named exports. No magic numbers elsewhere.
- **Components get audio only via `useAudioServices()`**; never touch Web Audio, `getUserMedia`
  or the adapters directly. Tests inject fakes through `AudioServicesProvider`.
- **Written vs concert pitch:** melodies are stored as *written* MIDI (what the trumpeter reads,
  54..72, names shown to the user). Convert with `writtenToConcert` (−2 semitones) only at the
  audio boundaries (synth playback frequencies, detection target).
- **Scales and spelling:** a scale exercise is spelled by its key signature (`spellInKey`, via
  `spellExercise`); chromatic exercises keep the contextual `spellMelody`. Scale option ids
  (`chromatic`, `group:<x>`, `<type>:<tonic-slug>`) are persisted: keep them stable.
- **Generator rng contract:** `generateExercise` consumes one rng call to pick a group member
  (groups only, first), then exactly one per note (`pickIndex`). Tests script the rng.
- **Settings rules live in pure `src/config/settings.ts`**; only `src/config/settingsStorage.ts`
  touches storage, and it receives the `Storage | null` as a parameter (tests use
  `src/test/fakeStorage.ts`, never the real `localStorage`). `App` receives `storage: Storage | null`
  as a prop (`getBrowserStorage()` in `main.tsx`); components never touch `localStorage`.
- **Live settings during training:** settings changes are not reducer actions. Volume is applied to
  the running playback (`setVolume`, only when it differs); note duration is read when a playback
  starts (next Repeat). Neither restarts the exercise or changes progress.
- **Settings dialog:** closing is owned by the `open` prop (Close, Esc via `onKeyDown` unless
  `defaultPrevented`, native `cancel` always prevented, browser-forced `close` → `onClose`). The
  `<dialog>` gets the `autofocus` attribute before `showModal()` (then `focus()` as a fallback), so
  focus lands on the dialog itself and the scale list never opens. The listbox prevents `mousedown`
  so pressing it (options, padding, scrollbar) never takes focus from the input. jsdom lacks
  `showModal`/`close`: `src/test/setup.ts` stubs them; tests press Esc with
  `user.keyboard('{Escape}')`.
- **Volume lives on the synth master gain** (`Playback.setVolume` ramps it over
  `SYNTH_VOLUME_RAMP_MS`, no-op after stop/end); per-note envelopes peak at
  `SYNTH_ENVELOPE_PEAK_GAIN`. Note duration is read once when playback starts.
- **One AudioContext per page**, created lazily and resumed by `unlock()`, which must run
  synchronously in click handlers before any `await` (iOS Safari autoplay policy).
- The microphone is opened raw (echo cancellation, noise suppression, AGC off), `fftSize` 2048,
  and the analyser is never connected to the destination. Each session reuses one `MicFrame`
  object and sample buffer: listeners must read a frame synchronously and never retain it.
- **TDD:** write the failing test first. Tests are co-located as `*.test.ts(x)` next to the code.
  Pure modules get table-driven unit tests; adapters get focused tests with mocked browser APIs
  (`src/test/fakeWebAudio.ts`, stubbed `navigator`/`requestAnimationFrame`).
- **Component tests** render through `AudioServicesProvider` with `createFakeAudioServices()`
  (`src/test/fakeAudioServices.ts`: spies, `failNextMicrophone`, `sessions`, `emitTone`,
  `playCalls` (each `{ frequenciesHz, noteDurationMs, volume, volumeChanges }`), `finishPlayback`,
  `stop`) and `vi.useFakeTimers({ shouldAdvanceTime: true })`; wrap
  async steps in `act` (see `src/test/appTestUtils.tsx` and `src/test/sessionDriver.ts`). Timer
  boundary checks ("not yet" / "now") use `TIMER_DRIFT_MARGIN_MS`, never a 1 ms margin:
  `shouldAdvanceTime` moves the fake clock with real time. Vitest
  runs without `globals`, so RTL cleanup is registered in `src/test/setup.ts`.
- **Effects must survive React StrictMode** (dev double-mount): `useTrainingSession` defers the
  unmount `mic.release()` by a microtask and stops playback only if it is still running.
- **E2E melody hook:** in the `dev:e2e` build (`VITE_E2E=true`) `?melody=` with 3–8 written MIDI
  numbers replaces the random melody (its length overrides Melody length; spelled in the selected
  specific scale's key, contextual for chromatic and groups); production builds ignore it.
- **Deploy:** `ci.yml` deploys on push to `vars.DEPLOY_BRANCH || 'main'`; Pages source must be
  "GitHub Actions".
- **Versioning (CI-owned):** `version.txt` is `X.Y.Z` on the deploy branch and
  `X.Y.Z-SNAPSHOT-<branch>` on feature branches. Before a PR, add `bump.txt` (`patch`/`minor`/`major`)
  and entries under `## [Unreleased]` in `CHANGELOG.md`; the `release-metadata` job enforces this on
  PRs. On push to the deploy branch the `release` job (only if `bump.txt` exists) bumps `version.txt`,
  `package.json` and `package-lock.json`, renames `## [Unreleased]` to
  `## [X.Y.Z] - Released on <date> by <author>`, deletes `bump.txt`, pushes a
  `chore(release): vX.Y.Z [skip ci]` commit and tag `vX.Y.Z`, and creates the GitHub release.
  Never bump versions by hand.
- Vitest only picks up `src/**/*.test.{ts,tsx}`; `e2e/**` belongs to Playwright.
- TypeScript strict, ESM, function components, plain CSS, named exports.
- `vite.config.ts` uses `base: '/trumpet-trainer/'` for builds (GitHub Pages repo name).
- Generated files are gitignored: `dist`, `test-results`, `playwright-report`, `e2e/fixtures/*.wav`.
