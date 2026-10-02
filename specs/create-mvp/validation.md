# Human Validation — prd.md

> Part 1 adds the scaffold, the music and audio domains, and the adapters. The UI is still a placeholder (the screens come in prd2.md), so most of these checks use commands and the browser's dev tools.

## Prerequisites

Start the test environment:

```bash
bash specs/create-mvp/create-environment.sh
```

## Validation Steps

### Scaffold and tooling

1. **Action**: Run `npm run test` in a second terminal.
   **Expected**: 13 test files and 196 tests pass, with 0 failures.

2. **Action**: Run `npm run lint` and `npm run typecheck`.
   **Expected**: Both finish with 0 errors. ESLint prints no problems and `tsc --noEmit` prints nothing.

3. **Action**: Run `npm run test:e2e`.
   **Expected**: The tone fixture is regenerated and Playwright exits with code 0 (no specs exist yet).

4. **Action**: Open `tsconfig.json`.
   **Expected**: `"strict": true` is set.

### App shell and dependency injection

5. **Action**: Open http://localhost:5173/ in Chrome.
   **Expected**: The tab title is "Trumpet Trainer" and the page shows the "Trumpet Trainer" heading. The DevTools console shows no errors. (The placeholder `App` renders inside `AudioServicesProvider`; if the provider were missing, the page would fail to render.)

6. **Action**: Open http://localhost:4173/trumpet-trainer/ (production preview) and check the Network tab.
   **Expected**: The page renders the same heading, and its JS/CSS assets load from `/trumpet-trainer/assets/...` with status 200 (correct GitHub Pages `base`).

### Constants

7. **Action**: Open `src/config/constants.ts` and compare it with the Constants table in `prd.md`.
   **Expected**: Every constant exists with the PRD value. For example: `WRITTEN_MIN_MIDI = 54`, `WRITTEN_MAX_MIDI = 72`, `TRANSPOSITION_SEMITONES = -2`, `TOLERANCE_CENTS = 25`, `SUSTAIN_MS = 500`, `DEFAULT_THRESHOLD_DB = -40`, `MIC_FFT_SIZE = 2048`.

### Music domain

8. **Action**: Run `npx vitest run src/music`.
   **Expected**: The notes, spelling and melody tests pass. The spelling suite lists all 7 worked-example rows, e.g. `[54, 61, 61, 58, 72] → Fa#3, Do#4, Do#4, Si♭3, Do5`.

### Audio domain

9. **Action**: Run `npx vitest run src/audio src/training`.
   **Expected**: The level, pitchDetector, sustainTracker, audioContext, synth, microphone, services and AudioServicesContext tests all pass. The pitch tests report E3, A4 and B♭4 for sine and sawtooth, and null for silence, noise, 100 Hz and 800 Hz.

10. **Action**: Check the fake-mic fixture: run `ls -l e2e/fixtures/tone-a4-440hz.wav`, then optionally play the file.
    **Expected**: The file exists (about 384 KB) and plays a steady 4-second A4 (440 Hz) tone.

11. **Action** (real browser check of the adapters): on http://localhost:5173/, open the DevTools console and run:
    ```js
    const { createBrowserAudioServices } = await import('/src/audio/services.ts');
    const { midiToHz, writtenToConcert } = await import('/src/music/notes.ts');
    const s = createBrowserAudioServices();
    s.unlock();
    const p = s.playMelody([71, 71, 64, 67, 72].map(w => midiToHz(writtenToConcert(w))), 500);
    await p.done; 'done'
    ```
    **Expected**: Five back-to-back, brass-like notes play (about 2.5 s total), the repeated notes are audible as separate attacks, and the console prints `'done'` right after the last note.

12. **Action**: In the same console run:
    ```js
    const mic = await s.openMicrophone();
    const { computeLevelDb } = await import('/src/audio/level.ts');
    const off = mic.subscribe(f => { const r = s.detectPitch(f.samples, mic.sampleRate); console.log(computeLevelDb(f.samples).toFixed(1), r && r.hz.toFixed(1)); });
    ```
    Then play or hum a steady note (e.g. a trumpet written Si4 = concert A4 440 Hz). After that, run `off(); mic.release();`.
    **Expected**: The browser asks for microphone permission once. After you allow it, the log shows levels in dBFS (around −60 or lower when silent, higher when playing). While a clear note sounds, a frequency between 150 and 500 Hz is logged (≈440 for A4); when the note is unclear or out of range, `null` is logged. After `release()`, logging stops and the browser's mic indicator goes off.

13. **Action**: Reload the page, block microphone access for localhost in the site settings, then run in the console:
    ```js
    const { createBrowserAudioServices } = await import('/src/audio/services.ts');
    const s = createBrowserAudioServices();
    await s.openMicrophone().catch(e => e.kind)
    ```
    **Expected**: The call returns `'permission-denied'`.

---

# Human Validation — prd2.md

## Prerequisites

Start the test environment:

```bash
bash specs/create-mvp/create-environment.sh
```

Steps marked **(real trumpet)** need a B♭ trumpet, or any instrument or tone generator playing the concert pitch. The deterministic step uses the e2e-mode server on port 5174 together with a 440 Hz tone generator (for example a phone app held near the mic).

## Validation Steps

### Automated checks

1. **Action**: Run `npm test`, `npm run lint` and `npm run typecheck`.
   **Expected**: 20 test files and 302 tests pass. Lint and typecheck print no errors.

2. **Action**: Stop the environment script (Ctrl+C), then run `npm run test:e2e`.
   **Expected**: 3 Playwright specs pass (mic meter, matching melody, non-matching melody).

### Home screen

3. **Action**: Open http://localhost:5173/.
   **Expected**: You see "Trumpet Trainer", a "Start training" button, a "Test microphone" button (not pressed), a level bar at its minimum, and a slider labelled "Threshold: −40 dB".

4. **Action**: Click "Test microphone" and allow the microphone. Speak or play, then click it again.
   **Expected**: The button looks pressed and the bar moves with your sound. The fill turns green when the level is above the threshold marker and is neutral below it. Clicking again empties the bar, and the browser's mic-in-use indicator turns off.

5. **Action**: Drag the threshold slider to about −20 dB.
   **Expected**: The label updates ("Threshold: −20 dB"), the marker moves, and the fill turns green only above the new value.

### Microphone errors

6. **Action**: Block the microphone for localhost in the site settings, reload, and click "Start training".
   **Expected**: You stay on Home and see the inline alert "Microphone access is blocked. Allow the microphone for this site…". No melody plays, and "Start training" stays enabled.

7. **Action**: Allow the microphone again, reload, and click "Start training".
   **Expected**: The alert disappears and training starts.

### Training flow

8. **Action**: Click "Start training".
   **Expected**: The status says "Listen…". You see 5 grey boxes, the first with a thick highlighted border. "Repeat melody" and "Give up" are disabled. Five distinct notes play (about 2.5 s). Then the status shows "Get ready…" briefly, followed by "Your turn: play note 1 of 5", and the buttons become enabled.

9. **Action**: Stay silent through the playback and the guard.
   **Expected**: The speaker playback never turns a box green.

10. **Action (real trumpet)**: Play the first note correctly and hold it for about 0.5 s.
    **Expected**: Box 1 turns green and shows the written name (e.g. "Fa#3", "Si♭3"). The highlight moves to box 2 and the status reads "Your turn: play note 2 of 5".

11. **Action (real trumpet)**: Play a wrong note, then the right note an octave off.
    **Expected**: Nothing changes.

12. **Action**: After at least one box is green, click "Repeat melody".
    **Expected**: The buttons are disabled and the melody replays. Green boxes stay green and the highlight stays on the same box. After playback, listening resumes. The mic indicator stays on throughout.

13. **Action**: Click "Give up".
    **Expected**: Home is shown immediately and the mic indicator turns off. The threshold you set earlier is still the same.

14. **Action (real trumpet)**: Complete all 5 notes.
    **Expected**: All boxes turn green, the status reads "Well done!" and the buttons are disabled. About 1.5 s later Home returns on its own and the mic indicator turns off.

### Threshold gating

15. **Action (real trumpet)**: Set the threshold to 0 dB, start training and play the correct note loudly.
    **Expected**: No box turns green, because detection is blocked.

### Deterministic mode (e2e hook)

16. **Action**: Open http://localhost:5174/?melody=71,71,71,71,71, click "Start training", and after the playback play a steady 440 Hz tone.
    **Expected**: The melody is five repeated notes. The five boxes turn green one after another, each showing "Si4", and Home returns after about 1.5 s.

17. **Action**: Open http://localhost:5173/?melody=71,71,71,71,71 (normal dev server) and http://localhost:4173/trumpet-trainer/?melody=71,71,71,71,71 (production preview), then start training.
    **Expected**: The `melody` parameter is ignored and a random melody plays instead.

### CI/CD

18. **Action**: Review `.github/workflows/ci.yml`.
    **Expected**: It runs on push and pull_request with Node 22. Job `check` runs lint, typecheck, test and build. Job `e2e` runs Playwright and uploads the report on failure. Job `deploy` needs both and runs only on push to `vars.DEPLOY_BRANCH || 'main'`, deploying `dist` to GitHub Pages.

19. **Action**: (One-time repo setup) Enable GitHub Pages with source "GitHub Actions". Create `main`, or set the repository variable `DEPLOY_BRANCH`, then push.
    **Expected**: The workflow succeeds and the app loads at the Pages URL under `/trumpet-trainer/`.
