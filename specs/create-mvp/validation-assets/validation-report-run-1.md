# Validation Report — Run 1

- **Feature:** create-mvp (Trumpet Trainer MVP) — checklist `specs/create-mvp/validation.md`
- **Started:** 2026-10-02T21:58:23.883Z  ·  **Finished:** 2026-10-02T22:06:46.888Z
- **Host:** win32 x64, Node v20.16.0
- **Script:** `specs/create-mvp/validation-run-1/validate.mjs` (wrapper `run.sh`)
- **Environment log:** [create-environment.txt](run-1/output/create-environment.txt)

**Summary:** 21 passed, 10 failed, 1 skipped

> Items marked "proxy" use Chromium's fake microphone (a looping 440 Hz tone = written Si4) and the e2e-mode `?melody=` hook instead of a real trumpet. Real-instrument tuning, speaker→mic leakage, audible timbre and OS mic indicators remain manual checks.

## Part 1 (prd.md)

### Scaffold and tooling

- ✅ **P1-1 Unit tests (`npm test`)** — 20 test files / 302 tests (302 passed, 0 failed), exit 0. Part 1's expected 13 files / 196 tests are superseded by Part 2's 20 files / 302 tests (Part 2 added tests).
  - Output: [01-npm-test.txt](run-1/output/01-npm-test.txt)
- ✅ **P1-2 Lint and typecheck** — lint exit 0, no problems printed; typecheck exit 0, no output
  - Output: [02-lint.txt](run-1/output/02-lint.txt), [03-typecheck.txt](run-1/output/03-typecheck.txt)
- ✅ **P1-3 E2E (`npm run test:e2e`)** — exit 0; tone fixture regenerated; Playwright: 3 passed, 0 failed, 0 flaky. (Part 1 expected "no specs yet"; Part 2 now ships 3 specs.)
  - Output: [04-test-e2e.txt](run-1/output/04-test-e2e.txt)
- ✅ **P1-4 tsconfig strict** — tsconfig.json compilerOptions.strict = true

### App shell and dependency injection

- ✅ **P1-5 Dev server renders the app shell** — title "Trumpet Trainer", heading "Trumpet Trainer" visible, console errors: 0.
  - Output: [11-console-dev.txt](run-1/output/11-console-dev.txt)

  ![P1-5 01-p1-home-dev](run-1/screenshots/01-p1-home-dev.png)

- ❌ FAIL **P1-6 Production preview under /trumpet-trainer/** — Heading rendered: false; 1 JS + 1 CSS asset(s) requested under /trumpet-trainer/assets/, all 200 with the right content type: no (404 - /trumpet-trainer/assets/index-l9Jvc4TA.js, 200 text/html /trumpet-trainer/assets/index-D2RuqXiL.css). Root-path probe: 200 text/javascript http://localhost:4173/assets/index-l9Jvc4TA.js; 200 text/css http://localhost:4173/assets/index-D2RuqXiL.css — if these are 200, `vite preview` serves the build at "/" (vite.config.ts sets base "/trumpet-trainer/" only when command === 'build'; preview runs with command 'serve').
  - Output: [12-preview-assets.txt](run-1/output/12-preview-assets.txt)

  ![P1-6 02-p1-home-preview](run-1/screenshots/02-p1-home-preview.png)

### Constants

- ✅ **P1-7 Constants match the PRD table** — 26/26 PRD constants match (values read from the live module via the dev server); extra helpers: 6.
  - Output: [13-constants-compare.md](run-1/output/13-constants-compare.md)

### Music domain

- ✅ **P1-8 Music tests incl. 7 spelling worked examples** — exit 0; 3 files / 72 tests, 0 failed; suites seen: notes.test.ts, spelling.test.ts, melody.test.ts; worked-example rows: 7/7; row [54,61,61,58,72] → Fa#3, Do#4, Do#4, Si♭3, Do5 found (exact).
  - Output: [05-vitest-music.txt](run-1/output/05-vitest-music.txt)

### Audio domain

- ✅ **P1-9 Audio + training tests** — exit 0; 10 files / 146 tests, 0 failed; suites missing: none; pitch cases (E3/A4/B♭4 sine+sawtooth, null for silence/noise/100 Hz/800 Hz) missing: none.
  - Output: [06-vitest-audio-training.txt](run-1/output/06-vitest-audio-training.txt)
- ✅ **P1-10 Fake-mic fixture WAV** — 384044 bytes (≈375 KB), 48000 Hz / 1 ch / 16-bit, 4.00 s, ≈439.8 Hz steady across all 0.5 s windows, RMS -9.0 dBFS. "Plays a steady tone" verified by signal analysis instead of by ear.
  - Output: [07-wav-analysis.txt](run-1/output/07-wav-analysis.txt)
- ✅ **P1-11 Synth playback in a real browser** — p.done resolved after 2760 ms (expected ≈2.5 s, window 2.2–3.5 s), 'done' returned; 5 oscillator attacks at 440.0, 440.0, 293.7, 349.2, 466.2 Hz (expected 440, 440, 293.7, 349.2, 466.2). Brass-like timbre / audibly separate attacks are a human-ear check (5 separate oscillators with per-note envelopes verified).
  - Output: [14-synth-playback.json](run-1/output/14-synth-playback.json)
- ✅ **P1-12 Microphone frames + pitch detection in a real browser** — getUserMedia called once; 92 frames in 1.5 s at 48000 Hz; levels finite in [−100, 0] dBFS: true (range -100.0…-9.0); 89/92 frames detected 440±5 Hz, 0 out-of-range values; after off()+release(): 0 more frames, tracks live → ended. Uses the fake 440 Hz mic (real humming/trumpet and the OS mic indicator remain manual).
  - Output: [15-mic-frames.json](run-1/output/15-mic-frames.json)
- ✅ **P1-13 Denied microphone maps to permission-denied** — Simulated denial (getUserMedia → DOMException NotAllowedError) returned 'permission-denied'; microphone.ts maps NotAllowedError/SecurityError → permission-denied: true. Real headless-shell denial returned 'unknown' (headless shell has no permission UI and reports NotSupportedError), so blocking via real site settings stays a manual check.
  - Output: [16-mic-denied.txt](run-1/output/16-mic-denied.txt)

## Part 2 (prd2.md)

### Automated checks

- ✅ **P2-1 npm test / lint / typecheck** — npm test: 20 test files / 302 tests (302 passed, 0 failed), exit 0 — matches expected 20 / 302; lint exit 0, no problems printed; typecheck exit 0, no output.
  - Output: [01-npm-test.txt](run-1/output/01-npm-test.txt), [02-lint.txt](run-1/output/02-lint.txt), [03-typecheck.txt](run-1/output/03-typecheck.txt)
- ✅ **P2-2 Playwright e2e specs** — Expected 3 passed (mic meter, matching melody, non-matching melody); got 3 passed, 0 failed, exit 0.
  - Output: [04-test-e2e.txt](run-1/output/04-test-e2e.txt)

### Home screen

- ✅ **P2-3 Home screen initial state** — Heading + "Start training" (enabled) visible; Test microphone aria-pressed="false"; meter aria-valuenow=-60 (min -60); slider value -40; label "Threshold: −40 dB" (U+2212 minus: true).

  ![P2-3 03-p2-home-initial](run-1/screenshots/03-p2-home-initial.png)

- ✅ **P2-4 Test microphone toggle and level meter** — On: aria-pressed=true, meter aria-valuenow=-9 dBFS (fake 440 Hz tone, fill width 85.0087%), fill class "mic-meter__fill mic-meter__fill--ok" (green rgb(34, 165, 90)) above the −40 threshold. Off: aria-pressed=false, aria-valuenow=−60, fill rgb(107, 114, 128), mic tracks ended (mic released → browser indicator off).

  ![P2-4 04-p2-mic-test-on](run-1/screenshots/04-p2-mic-test-on.png)

  ![P2-4 05-p2-mic-test-off](run-1/screenshots/05-p2-mic-test-off.png)

- ✅ **P2-5 Threshold slider** — Slider set to −20 → label "Threshold: −20 dB", slider value -20 (marker at 67% of the bar vs 33% before — see screenshots). Level -9 dBFS ≥ −20 → fill green: true (expected true). At 0 dB threshold, level -9 → green: false (expected false).

  ![P2-5 06-p2-threshold-minus20](run-1/screenshots/06-p2-threshold-minus20.png)

  ![P2-5 07-p2-threshold-0](run-1/screenshots/07-p2-threshold-0.png)

### Microphone errors

- ✅ **P2-6 Blocked microphone shows inline alert** — Alert: "Microphone access is blocked. Allow the microphone for this site (usually via the icon in the address bar or your browser's site settings), then press Start training again."; Start training enabled: true; Training screen shown: false; oscillators started (melody played): 0. Denial simulated by getUserMedia rejecting with NotAllowedError (headless Chromium has no site-settings UI).

  ![P2-6 08-p2-mic-blocked](run-1/screenshots/08-p2-mic-blocked.png)

- ✅ **P2-7 Allowed microphone starts training** — After allowing the microphone, Start training → alert count 0, Training screen shown with status "Listen…".

  ![P2-7 09-p2-mic-allowed-training](run-1/screenshots/09-p2-mic-allowed-training.png)

### Training flow

- ✅ **P2-8 Start training: playing → guard → listening** — Status sequence 54ms:"Listen…" → 2617ms:"Get ready…" → 2885ms:"Your turn: play note 1 of 5" (t=0 at click). Click → "Get ready…" 2617 ms (≈2.5 s expected), guard 269 ms (250 expected). Boxes at start: active, pending, pending, pending, pending; Repeat/Give up disabled while playing: true/true, enabled when listening: true/true. Melody oscillators (last 5): 164.8, 261.6, 233.1, 246.9, 349.2 Hz. Audibility of the 5 notes is a human-ear check.
- ❌ FAIL **P2-9 Speaker playback never turns a box green** — Exception: locator.click: Timeout 30000ms exceeded. Call log: [2m  - waiting for getByRole('button', { name: 'Start training' })[22m 

  ![P2-9 13-p2-9-error](run-1/screenshots/13-p2-9-error.png)

- ❌ FAIL **P2-10 Correct note turns box green and advances** — Exception: locator.click: Timeout 30000ms exceeded. Call log: [2m  - waiting for getByRole('button', { name: 'Start training' })[22m 

  ![P2-10 14-p2-10-error](run-1/screenshots/14-p2-10-error.png)

- ❌ FAIL **P2-11 Wrong note / octave off changes nothing** — Proxy on 5174 with the fake 440 Hz tone. wrong-note: exception locator.click: Timeout 30000ms exceeded.; octave-off: exception locator.click: Timeout 30000ms exceeded.. Real trumpet wrong-note/octave checks remain manual.
- ❌ FAIL **P2-12 Repeat melody** — Exception: locator.click: Timeout 30000ms exceeded. Call log: [2m  - waiting for getByRole('button', { name: 'Start training' })[22m 

  ![P2-12 15-p2-12-error](run-1/screenshots/15-p2-12-error.png)

- ❌ FAIL **P2-13 Give up** — Exception: locator.evaluate: Timeout 30000ms exceeded. Call log: [2m  - waiting for getByRole('slider', { name: 'Threshold' })[22m 

  ![P2-13 16-p2-13-error](run-1/screenshots/16-p2-13-error.png)

- ❌ FAIL **P2-14 Complete all 5 notes** — Exception: locator.click: Timeout 30000ms exceeded.

  ![P2-14 17-p2-14-error](run-1/screenshots/17-p2-14-error.png)

### Threshold gating

- ❌ FAIL **P2-15 Threshold 0 dB blocks detection** — Exception: locator.evaluate: Timeout 30000ms exceeded. Call log: [2m  - waiting for getByRole('slider', { name: 'Threshold' })[22m 

  ![P2-15 19-p2-15-error](run-1/screenshots/19-p2-15-error.png)

### Deterministic mode

- ❌ FAIL **P2-16 ?melody=71,71,71,71,71 on the e2e-mode server** — Exception: locator.click: Timeout 30000ms exceeded.

  ![P2-16 18-p2-16-error](run-1/screenshots/18-p2-16-error.png)

- ❌ FAIL **P2-17 ?melody ignored on dev and production preview** — Synth oscillator frequencies recorded via an init script: dev-5173: played 370.0, 174.6, 440.0, 207.7, 440.0 Hz (random, not the 71×5 param); preview-4173: the app did not render ("Start training" not found) — cannot check the param. (?melody=71,71,71,71,71 would be five 440 Hz notes; the chance of a random melody being that is (1/19)^5.)

  ![P2-17 20-p2-melody-param-ignored-dev-5173](run-1/screenshots/20-p2-melody-param-ignored-dev-5173.png)

  ![P2-17 21-p2-melody-param-preview-4173-not-rendered](run-1/screenshots/21-p2-melody-param-preview-4173-not-rendered.png)

### CI/CD

- ✅ **P2-18 ci.yml review** — All 16 ci.yml expectations met (triggers, Node 22, check/e2e/deploy jobs, Pages deploy of dist).
  - Output: [08-ci-yml-check.txt](run-1/output/08-ci-yml-check.txt)
- ⏭️ SKIP **P2-19 GitHub Pages deployment** — Manual: needs GitHub repo settings (Pages source "GitHub Actions", main or DEPLOY_BRANCH) and a push. Remote: https://github.com/fer5899/trumpet-trainer.git; current branch: create-mvp.
  - Output: [09-git-remote.txt](run-1/output/09-git-remote.txt)
