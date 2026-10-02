# Project-Specific PRD Guidance

This file customizes how PRDs are generated for this specific project. The core PRD generation workflow is defined in the skill; this file provides project-specific content expectations.

> **Status:** written before any code existed. Everything below comes from the MVP PRD
> (`specs/create-mvp/prd.md`, `specs/create-mvp/prd2.md`). Once the MVP is implemented,
> re-check paths and names against the real code (TODO).

## Project Type

Frontend-only single-page web app (Vite + React + TypeScript) that plays short melodies with the Web Audio API and listens to a B♭ trumpet through the microphone (`getUserMedia` + `pitchy` pitch detection). No backend, no database, no accounts. Statically hosted on GitHub Pages.

## PRD Content Guidance

When generating PRDs for this project, ensure:

### Music domain (TypeScript, pure modules)

- Reference `src/music/notes.ts`, `src/music/spelling.ts`, `src/music/melody.ts` and the constants in `src/config/constants.ts`.
- Keep the written vs concert distinction explicit. Use the branded/aliased types `WrittenMidi` and `ConcertMidi` (concert = written + `TRANSPOSITION_SEMITONES`). Display names are written; playback and detection are concert pitch (A4 = 440 Hz).
- Note names use Latin solfège with `#` / `♭` and scientific octave numbers (MIDI 60 = Do4). Spelling rules live in `spelling.ts`. Give worked examples (input MIDI → names) for any change to naming.
- All tunables are named constants in `src/config/constants.ts`. PRDs should add constants there and never introduce magic numbers.
- Randomness must be injectable (`rng: () => number`) so tests are deterministic.

### Audio layer (TypeScript, Web Audio)

- Pure, unit-testable pieces: `src/audio/level.ts` (RMS → dBFS) and `src/audio/pitchDetector.ts` (wraps `pitchy`, returns `{ hz, clarity } | null`).
- Thin adapters over browser APIs hold no business logic: `audioContext.ts` (one shared AudioContext, unlocked inside the click handler), `synth.ts` and `microphone.ts` (`MicrophoneError` with kinds `permission-denied` | `unsupported` | `unknown`).
- All audio reaches React through the injected `AudioServices` interface (`src/audio/services.ts`, `AudioServicesContext.tsx`). New audio capabilities must extend that interface and `createBrowserAudioServices()`, and the matching fake in `src/test/fakeAudioServices.ts`.
- Specify interfaces with TypeScript signatures, and give timing behavior as named constants in milliseconds.

### Training logic (TypeScript)

- `src/training/sustainTracker.ts` is pure and clock-injected: frames carry `timeMs`.
- `src/training/trainingReducer.ts` is a pure reducer state machine. PRDs changing the flow must give a transition table (state × action → next state, plus ignored pairs).
- `src/training/useTrainingSession.ts` binds the reducer to the adapters (effects per phase).

### UI (React 18 function components, plain CSS)

- Components live in `src/components/` (`App`, `HomeScreen`, `MicLevelMeter`, `TrainingScreen`, `NoteBox`). Styles are in the single `src/styles.css`. There's no UI library, router or state library.
- Specify component props as TypeScript interfaces, plus the accessibility hooks tests rely on: roles, accessible names, `data-testid` such as `note-box-N`, `aria-valuenow` on the meter.
- UI text is English; note names are solfège. Put exact user-facing strings in the PRD.
- Mockups use ASCII art and show every relevant state (idle, playing/disabled, listening/active, progress, complete, error).
- State is in-memory React state (App level). There is no persistence unless the idea explicitly asks for it.

### Testing

- Unit tests: Vitest, co-located as `src/**/<name>.test.ts`. Use table-driven cases for music rules, synthetic buffers for pitch detection, and explicit timestamps for trackers.
- Component tests: Vitest + jsdom + React Testing Library + user-event, co-located as `<Component>.test.tsx`. Use `createFakeAudioServices()` and fake timers (`vi.useFakeTimers({ shouldAdvanceTime: true })`). Never use real Web Audio.
- E2E tests: Playwright (Chromium only) in `e2e/*.spec.ts`. They use a fake mic fed by a generated WAV (`scripts/generate-test-tones.mjs`, output in `e2e/fixtures/`) and a deterministic melody via `?melody=` in the `--mode e2e` dev build.
- Thin adapters are covered by e2e tests and a manual validation checklist (real trumpet, desktop and mobile browsers), not unit tests.

## Out-of-Scope Defaults

Unless the idea explicitly mentions them, PRDs should NOT include:

- Any backend, server API, user accounts or authentication
- Persistence (localStorage, IndexedDB) of settings or history
- New runtime dependencies beyond `react`, `react-dom` and `pitchy` (UI kits, routers, state libraries, audio frameworks)
- CI/CD workflow (`.github/workflows/ci.yml`) and GitHub Pages deployment changes
- Instrument/transposition or notation selectors, sheet music rendering
- Internationalization of UI text
- Dependency upgrades unrelated to the feature
