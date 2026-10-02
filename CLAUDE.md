# Trumpet Trainer

Frontend-only web app for B♭ trumpet ear training: it plays a 5-note random melody, listens through
the microphone while the user plays it back, and marks each note green once it is played in tune
(±25 cents) and held for 0.5 s. No backend, no accounts, no persistence.

- Product source of truth: `specs/create-mvp/IDEA.md`
- Specs: `specs/create-mvp/prd.md` (Part 1: scaffold, constants, music + audio domain, adapters)
  and `specs/create-mvp/prd2.md` (Part 2: training state machine, hook, UI, e2e specs, CI/CD)
- Status: Parts 1 and 2 are implemented (full MVP: Home + Training screens, e2e specs, CI/CD to
  GitHub Pages).

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
| `npm run generate:tones` | Writes `e2e/fixtures/tone-a4-440hz.wav` (440 Hz, 4 s, 16-bit mono 48 kHz) |
| `npm run test:e2e` | Generates the tone, then `playwright test` (starts `dev:e2e` itself; stop any other server on 5173 first) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

First-time e2e setup: `npx playwright install chromium`.

## Architecture: pure core, thin adapters

Everything that decides something is a pure, deterministic function with injected time/randomness
and is unit-tested. Browser APIs are wrapped in thin adapters that contain no decisions.

```
src/config/constants.ts        all tunables (ranges, durations, tolerances, synth, fft size)
src/music/notes.ts             types (WrittenMidi, ConcertMidi, Melody, Accidental), range,
                               transposition, midiToHz, centsFrom, noteName (Latin solfège)
src/music/spelling.ts          spellMelody: contextual sharps/flats (IDEA §5.3)
src/music/melody.ts            generateMelody(rng, length)
src/audio/level.ts             computeLevelDb: RMS in dBFS, clamped to [-100, 0]
src/audio/pitchDetector.ts     detectPitch: pitchy wrapper + range/clarity filtering
src/training/sustainTracker.ts clock-injected "held ±25 c for 500 ms" detector
src/audio/audioContext.ts      ADAPTER: single shared AudioContext + unlockAudio()
src/audio/synth.ts             ADAPTER: playSequence → Playback { done, stop() }
src/audio/microphone.ts        ADAPTER: openMicrophone → MicrophoneSession, MicrophoneError
src/audio/services.ts          AudioServices interface + createBrowserAudioServices()
src/audio/AudioServicesContext.tsx  AudioServicesProvider + useAudioServices()
src/training/trainingReducer.ts  pure state machine playing → guard → listening → complete,
                               selectNoteBoxes, selectCanAct
src/training/useTrainingSession.ts  hook wiring reducer + tracker to AudioServices (effects keyed
                               on phase: play / guard timer / mic subscription / complete timer)
src/testing/testMelody.ts      e2e hook: `?melody=71,71,71,71,71`, only when VITE_E2E === 'true'
src/components/App.tsx         root: Home ⇄ Training, in-memory threshold, Start handler
src/components/HomeScreen.tsx  title, Start training, start error, MicLevelMeter
src/components/MicLevelMeter.tsx  Test microphone toggle, role="meter" bar + overlaid threshold slider
src/components/micErrorMessage.ts  MicrophoneErrorKind → user-facing text
src/components/TrainingScreen.tsx  status line, 5 NoteBoxes, Repeat melody / Give up
src/components/NoteBox.tsx     pending / active / done box (data-testid note-box-{i}, data-state)
src/main.tsx                   createRoot + <AudioServicesProvider services={createBrowserAudioServices()}>
src/test/                      setup.ts (jest-dom + RTL cleanup), signals.ts (sine/sawtooth/seeded
                               noise), fakeWebAudio.ts (recording Web Audio node fakes),
                               fakeAudioServices.ts (createFakeAudioServices), appTestUtils.tsx
                               (renderApp + act-wrapped click/finishPlayback/elapse/hold helpers)
e2e/                           training.spec.ts, mic-meter.spec.ts (fake mic = looping 440 Hz tone)
scripts/generate-test-tones.mjs  fake-mic WAV fixture (Node built-ins only)
vite.config.ts                 base (/ dev, /trumpet-trainer/ build+preview), e2e mode uses its own cacheDir
playwright.config.ts           Chromium with --use-fake-device/ui-for-media-stream + the WAV
.github/workflows/ci.yml       check (lint/typecheck/test/build), e2e, deploy to GitHub Pages
```

## Conventions

- **All tunables live in `src/config/constants.ts`** as named exports. No magic numbers elsewhere.
- **Components get audio only via `useAudioServices()`**; never touch Web Audio, `getUserMedia`
  or the adapters directly. Tests inject fakes through `AudioServicesProvider`.
- **Written vs concert pitch:** melodies are stored as *written* MIDI (what the trumpeter reads,
  54..72, names shown to the user). Convert with `writtenToConcert` (−2 semitones) only at the
  audio boundaries (synth playback frequencies, detection target).
- **One AudioContext per page**, created lazily and resumed by `unlock()`, which must run
  synchronously in click handlers before any `await` (iOS Safari autoplay policy).
- The microphone is opened raw (echo cancellation, noise suppression, AGC off), `fftSize` 2048,
  and the analyser is never connected to the destination.
- **TDD:** write the failing test first. Tests are co-located as `*.test.ts(x)` next to the code.
  Pure modules get table-driven unit tests; adapters get focused tests with mocked browser APIs
  (`src/test/fakeWebAudio.ts`, stubbed `navigator`/`requestAnimationFrame`).
- **Component tests** render through `AudioServicesProvider` with `createFakeAudioServices()`
  (`src/test/fakeAudioServices.ts`: spies, `failNextMicrophone`, `sessions`, `emitTone`,
  `playCalls`, `finishPlayback`, `stop`) and `vi.useFakeTimers({ shouldAdvanceTime: true })`; wrap
  async steps in `act` (see `src/test/appTestUtils.tsx`). Vitest runs without `globals`, so RTL
  cleanup is registered in `src/test/setup.ts`.
- **Effects must survive React StrictMode** (dev double-mount): `useTrainingSession` defers the
  unmount `mic.release()` by a microtask and stops playback only if it is still running.
- **E2E melody hook:** in the `dev:e2e` build (`VITE_E2E=true`) `?melody=` with 5 written MIDI
  numbers replaces the random melody; production builds ignore it.
- **Deploy:** `ci.yml` deploys on push to `vars.DEPLOY_BRANCH || 'main'`; Pages source must be
  "GitHub Actions".
- Vitest only picks up `src/**/*.test.{ts,tsx}`; `e2e/**` belongs to Playwright.
- TypeScript strict, ESM, function components, plain CSS, named exports.
- `vite.config.ts` uses `base: '/trumpet-trainer/'` for builds (GitHub Pages repo name).
- Generated files are gitignored: `dist`, `test-results`, `playwright-report`, `e2e/fixtures/*.wav`.
