# Project-Specific Validation Configuration

This file customizes how validation scripts are generated and run for this specific project. The core validation workflow is defined in the skill; this file provides project-specific strategies, prerequisites, and script generation guidance.

> **Status:** written before any code existed and based on `specs/create-mvp/prd.md` / `prd2.md`.
> Verify selectors and scripts against the implemented app (TODO).

## Validation Strategy

| Checklist item type | Validation approach |
|---|---|
| Build, lint, types | `npm run lint`, `npm run typecheck`, `npm run build` |
| Pure logic (note names, spelling, melody, cents, sustain) | `npm test`, or a Node `.mjs` script importing built modules if a specific case isn't covered |
| UI flow (screens, buttons, box states, error messages) | Playwright (Chromium) against the `dev:e2e` server |
| Listening loop (correct note sustained → green box → home) | Playwright with a fake mic (`--use-file-for-fake-audio-capture`) + `?melody=` deterministic melody |
| Mic level meter / threshold slider | Playwright with a fake mic; read `aria-valuenow` on the meter and set the slider |
| Mic permission denied | Playwright context without the microphone permission, or without `--use-fake-ui-for-media-stream`; assert the inline error on Home |
| GitHub Pages build / `base` path | `npm run build && npm run preview`, then fetch `/trumpet-trainer/` and check that assets load |
| Real-instrument behavior (tuning tolerance, speaker playback not detected, room-noise threshold, iOS Safari, Android) | **Manual only.** Leave these items unchecked and report them for a human with a trumpet |

Choose the **simplest tool that can verify each item**.

## Prerequisites

### Vite dev server (e2e mode)

- **Start**: `npm run dev:e2e` (port 5173, `VITE_E2E=true` so `?melody=` works). Playwright's `webServer` config starts it automatically when using the project's `playwright.config.ts`.
- **Health check**: `curl -sf http://localhost:5173/` should return HTTP 200 with the HTML containing `<div id="root">`
- **Port**: 5173

### Fake mic fixture

- **Start**: `npm run generate:tones`
- **Health check**: `e2e/fixtures/tone-a4-440hz.wav` exists
- **Port**: n/a

### Playwright browser

- **Start**: `npx playwright install chromium` (once)

### No prerequisites needed for

- Lint, typecheck, unit/component tests (`npm test`) and the production build

## Technology-Specific Script Generation Guidance

### Playwright (browser automation)

- Use `@playwright/test`, Chromium only, viewport `devices['Desktop Chrome']`. Validation scripts can live in a scratch folder but should reuse the project's launch args:
  `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`, `--use-file-for-fake-audio-capture=<absolute path to e2e/fixtures/tone-a4-440hz.wav>`, `--autoplay-policy=no-user-gesture-required`.
- The fake tone is concert A4 (440 Hz), which is **written Si4 (MIDI 71)**. Use `?melody=71,71,71,71,71` for a melody the fake mic completes, and any other note (e.g. `60,…`) for "wrong note does nothing" checks.
- There's no component library. Select by role and accessible name (`getByRole('button', { name: 'Start training' })`, `'Repeat melody'`, `'Give up'`, `'Test microphone'`), and by `data-testid="note-box-N"` (N = 0..4) for boxes. Box state is exposed via class or attributes (`active`, `done`), and the meter via `aria-valuenow`.
- Timing: playback is 5 × 500 ms, then a 250 ms guard, then ≥ 500 ms sustain per note. Use generous timeouts (≥ 15 s for a full run) and wait on DOM state, never fixed sleeps, except for deliberate "nothing happens" checks.
- Save screenshots of each state (home, playing, listening, progress, complete, error) to the feature's validation output folder.
- Windows host: build paths with `path.resolve` and pass them unquoted inside the `--use-file-for-fake-audio-capture=` arg.

### Shell / npm commands

- Run from the repo root in Git Bash. Capture exit codes. For `npm test`, `npm run lint` and `npm run typecheck`, a zero exit code means pass.

## Script Language

Use Node.js (`.mjs`, or `.ts` run through Playwright test) as the default, since the project is TypeScript/JavaScript end to end and already depends on Playwright. The validation script language should match the project's ecosystem when practical.
