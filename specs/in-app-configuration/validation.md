# Human Validation — prd.md

Part 1 adds domain modules and audio plumbing but no new UI; the settings panel arrives in prd2.md. Most checks run
the new modules from the browser DevTools console. The Vite dev server serves source files, so they can be imported
directly.

## Prerequisites

Start the test environment:

```bash
bash specs/in-app-configuration/create-environment.sh
```

Open http://localhost:5173/ in Chrome, open DevTools → Console.

## Validation Steps

### Constants

1. **Action**: In the console run
   `const c = await import('/src/config/constants.ts'); [c.MELODY_LENGTH, c.NOTE_DURATION_MS, c.SYNTH_PEAK_GAIN, c.DEFAULT_NOTE_DURATION_MS, c.DEFAULT_VOLUME, c.DEFAULT_SCALE_ID]`
   **Expected**: `[undefined, undefined, undefined, 1000, 0.5, 'major:do']`.

### Scale catalog

2. **Action**: `const s = await import('/src/music/scales.ts'); s.SCALE_OPTIONS.length`
   **Expected**: `146`.

3. **Action**: `s.SCALE_OPTIONS.slice(0, 11).map(o => o.name)`
   **Expected**: Chromatic, All scales, All majors, All natural minors, All dorian, All phrygian, All lydian, All
   mixolydian, All locrian, All major pentatonics, All minor pentatonics.

4. **Action**: `s.SPECIFIC_SCALES.filter(x => x.type === 'locrian').map(x => x.tonicName).join(' ')`
   **Expected**: `Si Fa# Do# Sol# Re# La# Mi# Si# Mi La Re Sol Do Fa Si♭`.

5. **Action**: `s.searchScaleOptions('bb major').map(o => o.name)` and `s.searchScaleOptions('F# Dorian').map(o => o.name)`
   **Expected**: `['Si♭ major', 'Si♭ major pentatonic']` and `['Fa# dorian']`.

6. **Action**: `['chromatic', 'major:do', 'group:major-pentatonic', 'group:all'].map(s.minMaxInterval)`
   **Expected**: `[1, 2, 3, 3]`.

### Spelling in key

7. **Action**: `const sp = await import('/src/music/spelling.ts'); [sp.spellInKey([60, 65, 61], 7), sp.spellInKey([66, 71, 70], -6)]`
   **Expected**: `[['Si#3', 'Mi#4', 'Do#4'], ['Sol♭4', 'Do♭5', 'Si♭4']]`.

### Exercise generator

8. **Action**: `const m = await import('/src/music/melody.ts'); const r = [0, 0.5, 0.99]; let i = 0; const ex = m.generateExercise(() => r[i++], { length: 3, maxInterval: 12, scaleId: 'major:do' }); [ex.notes, ex.scale.id]`
   **Expected**: `[[55, 62, 72], 'major:do']`.

9. **Action**: `Array.from({ length: 5 }, () => m.generateExercise(Math.random, { length: 8, maxInterval: 2, scaleId: 'group:major' })).map(e => e.scale.id + ' ' + sp.spellExercise(e).join(' '))`
   **Expected**: five 8-note melodies. Each uses one major key, and every name fits its key signature (no stray
   accidentals). Consecutive notes are at most a whole step apart.

### Settings model and storage

10. **Action**: `const st = await import('/src/config/settings.ts'); st.normalizeSettings({ noteDurationMs: 750, volume: 2, scaleId: 'major:fa' })`
    **Expected**: `{ noteDurationMs: 750, melodyLength: 5, volume: 0.5, maxInterval: 12, scaleId: 'major:fa' }`.

11. **Action**: `const ss = await import('/src/config/settingsStorage.ts'); const ls = ss.getBrowserStorage(); ss.saveSettings(ls, { ...st.DEFAULT_SETTINGS, melodyLength: 7 }); ss.saveThreshold(ls, -35); location.reload()`. After the reload, run
    `const ss2 = await import('/src/config/settingsStorage.ts'); [ss2.loadSettings(localStorage).melodyLength, ss2.loadThreshold(localStorage)]`
    **Expected**: `[7, -35]`. This only checks the adapter; the app itself does not read storage until prd2.

12. **Action**: `localStorage.setItem('trumpet-trainer.settings.v1', '{not json'); ss2.loadSettings(localStorage)`, then
    `localStorage.clear()`.
    **Expected**: returns the defaults (1000, 5, 0.5, 12, `major:do`) without throwing.

### Synth volume and playback (app still works)

13. **Action**: Click **Start training** with speakers on.
    **Expected**: a 5-note chromatic melody plays (temporary bridge). Each note lasts about **1 s** (was 0.5 s) and the
    sound is noticeably **louder** than the v0.1.0 MVP. No clicks or distortion.

14. **Action**: Open http://localhost:5173/?melody=71,71,71,71,71, start training and let it play (or play concert A4 /
    written Si4 on the trumpet).
    **Expected**: five Si4 boxes. Playing the note in tune and holding it turns each box green, as in the MVP.

15. **Action**: `const sy = await import('/src/audio/synth.ts'); const { getAudioContext } = await import('/src/audio/audioContext.ts'); const p = sy.playSequence(getAudioContext(), [440, 494, 523, 587, 659], { noteDurationMs: 1000, volume: 0.2 }); setTimeout(() => p.setVolume(1), 2000)`
    (click the page first so audio is unlocked).
    **Expected**: the first two notes are quiet. From about 2 s the volume jumps up mid-melody, smoothly without a click.

### Regression

16. **Action**: Run `npm run lint && npm run typecheck && npm test && npm run test:e2e` (stop the dev server first for e2e).
    **Expected**: all pass (1027 unit tests, 3 e2e).

## Appendix A: Re-validation after /t-review #1

Run in the dev-server console (`npm run dev`, http://localhost:5173) unless noted.

17. **Action**: `const st = await import('/src/config/settings.ts'); const s = await import('/src/music/scales.ts'); [s.isScaleOptionId(st.DEFAULT_SETTINGS.scaleId), st.DEFAULT_SETTINGS.maxInterval >= s.minMaxInterval(st.DEFAULT_SETTINGS.scaleId)]` (review warning: settings.ts defaults)
    **Expected**: `[true, true]`.
18. **Action**: `[s.getSpecificScale('major:do')?.id, s.getScaleOption('major:do')?.name, s.getSpecificScale('group:all'), s.getSpecificScale('chromatic'), s.getSpecificScale('toString')]` (review warning: duplicated `scaleById`)
    **Expected**: `['major:do', 'Do major', undefined, undefined, undefined]` (`SpecificScale` has no `name`; the display name is on the `ScaleOption`); `grep -rn "function scaleById" src` finds nothing.
19. **Action**: `[s.minMaxInterval('group:all'), (() => { try { s.minMaxInterval('major:xx') } catch { return 'throws' } })()]` (review suggestion: scales.ts:187-192)
    **Expected**: `[3, 'throws']`.
20. **Action**: `[s.searchScaleOptions('C major').map(o => o.name).slice(0, 2), s.searchScaleOptions('F# Dorian').map(o => o.name)]` (review suggestion: scales.ts:203-207, English alias)
    **Expected**: first list starts with `Do major`; second is `['Fa# dorian']`.
21. **Action**: `const n = await import('/src/music/notes.ts'); [n.NOTE_LETTERS.join(' '), n.alterSign(1), n.alterSign(-1), n.alterSign(0)]`; then `grep -n "NOTE_LETTERS\|SHARP_SIGN\|FLAT_SIGN" src/music/scales.ts src/music/spelling.ts` (review suggestion: scales.ts:79-80)
    **Expected**: `['Do Re Mi Fa Sol La Si', '#', '♭', '']`; grep shows only imports from `./notes`.
22. **Action**: `[st.normalizeSettings({ volume: 0.333 }).volume, st.normalizeSettings({ volume: 0.35 }).volume]` (review suggestion: settings.ts:78)
    **Expected**: `[0.5, 0.35]` (off-step falls back to the default).
23. **Action**: `[st.parseThreshold(-35.5), st.parseThreshold(-35), st.parseThreshold(-59)]` (review suggestion: settings.ts:89)
    **Expected**: `[-40, -35, -59]` (off-step → `DEFAULT_THRESHOLD_DB`).
24. **Action**: `[s.searchScaleOptions('b major').map(o => o.name).slice(0, 2), s.searchScaleOptions('do').map(o => o.name).slice(0, 3)]` (review suggestion: scales.ts:215-219)
    **Expected**: first starts `['Si major', 'Si major pentatonic']`; second lists Do-tonic options (e.g. `Do major`) before any dorian option.
25. **Action**: `grep -n "19\|54" src/music/spelling.test.ts` around the 135-scale sweep (review suggestion: spelling.test.ts:~91)
    **Expected**: the sweep uses `scaleCandidates(scale)`; no hard-coded 19 / 54 / 12.
26. **Action**: Read `implementation-notes.md` → "Implementation details" and "Known issues" (review warning: useTrainingSession.ts:77-81; suggestion: implementation-notes.md)
    **Expected**: mentions `TIMER_DRIFT_MARGIN_MS` with its reason, and that Parts 1 and 2 ship in one PR (no `bump.txt` before Part 2).
27. **Action**: Re-run all original validation steps 1–16 (step 16 now expects **1196** unit tests).
    **Expected**: all pass; no regressions.


---

# Human Validation — prd2.md

Part 2 wires the settings into the app: the gear button, the Settings dialog, the scale combobox, persistence, live
volume / note duration during training and 3–8 note melodies.

## Prerequisites

Start the test environment (it now also starts an e2e-mode server on 5174 and a production preview on 4173):

```bash
bash specs/in-app-configuration/create-environment.sh
```

- Normal app: http://localhost:5173/ (random melodies; use it with a trumpet or another instrument).
- Deterministic melodies: http://localhost:5174/?melody=… (e2e mode; any 3–8 written MIDI numbers 54–72).
- Each port has its own `localStorage`. To start clean, run `localStorage.clear(); location.reload()` in the console.
- Speakers and a microphone; Chrome desktop plus a phone (Android Chrome / iOS Safari) for the layout checks. Phones
  need HTTPS for the microphone: use the deployed GitHub Pages build or an HTTPS tunnel to the preview on 4173.

## Validation Steps

### Gear button and dialog

1. **Action**: Open http://localhost:5173/.
   **Expected**: a gear button (⚙) in the top-right corner, above the title. Hovering/inspecting shows the accessible
   name "Settings".
2. **Action**: Click the gear.
   **Expected**: a modal dialog titled **Settings** over a dimmed page with: **Scale** "Do major", **Melody length**
   "5 notes", **Max interval** "12 semitones", **Note duration** "1000 ms", **Playback volume** "50%", and the buttons
   **Reset to defaults** and **Close**. There is no Save button. The scale list is not open yet.
3. **Action**: Press **Esc**.
   **Expected**: the dialog closes and keyboard focus is back on the gear (a focus ring shows on it).
4. **Action**: Open it again and click **Close**.
   **Expected**: it closes; focus is on the gear.
5. **Action**: Open it again and click the dimmed area outside the dialog.
   **Expected**: nothing happens (the dialog stays open).
6. **Action**: Press **Tab** repeatedly inside the dialog.
   **Expected**: focus cycles through Scale, the four sliders, Reset to defaults, Close and never reaches the page
   behind the dialog.
7. **Action**: Reset the microphone permission for localhost (padlock icon → Site settings → Microphone: Ask), then
   click **Start training** and look at the page while the browser's permission prompt is showing.
   **Expected**: **Start training**, **Test microphone** and the gear are disabled until you answer the prompt. Once
   the training screen appears, the gear is enabled again.

### Sliders (Home mode)

8. **Action**: Drag **Melody length** from end to end.
   **Expected**: the value goes from "3 notes" to "8 notes" in steps of 1.
9. **Action**: Drag **Note duration** from end to end.
   **Expected**: "250 ms" to "1500 ms" in steps of 50 ms.
10. **Action**: Drag **Playback volume** from end to end.
    **Expected**: "0%" to "100%" in steps of 5%.
11. **Action**: With the scale **Chromatic**, drag **Max interval** fully left, then fully right.
    **Expected**: left = "1 semitone" (singular), right = "18 semitones".
12. **Action**: With a screen reader (NVDA / VoiceOver) or the DevTools Accessibility pane, inspect each slider.
    **Expected**: each has a label (its name) and an `aria-valuetext` equal to the visible value ("5 notes", "12
    semitones", "1000 ms", "50%").

### Scale combobox

13. **Action**: Click the **Scale** field.
    **Expected**: the text "Do major" is selected and a list opens below it (inside the dialog, scrollable, about 15rem
    high) with **Chromatic**, **All scales**, **All majors** … the groups, then the 135 scales. **Do major** is
    highlighted and scrolled into view.
14. **Action**: Type `bb major`.
    **Expected**: the list narrows to **Si♭ major** (highlighted) and **Si♭ major pentatonic**.
15. **Action**: Press **Enter**.
    **Expected**: the list closes and the field shows "Si♭ major". The dialog stays open.
16. **Action**: Click the field, type `xyz`.
    **Expected**: a single greyed "No matching scales" row; clicking it or pressing Enter does nothing.
17. **Action**: Press **Esc** once.
    **Expected**: only the list closes; the field reverts to "Si♭ major"; the dialog stays open. Press **Esc** again:
    the dialog closes.
18. **Action**: Reopen the dialog, click the field, type `sol` and press **Tab** (or click elsewhere in the dialog).
    **Expected**: the list closes and the field reverts to the previous scale (no change).
19. **Action**: Click the field and use **ArrowDown** / **ArrowUp**.
    **Expected**: the highlight moves one option at a time and stops at the first/last option (no wrap-around); the
    list scrolls to keep it visible. **Enter** selects the highlighted option.
20. **Action**: Type `f# dorian` and press **Enter**; then type `sib` and click **Si♭ major pentatonic** with the mouse.
    **Expected**: first "Fa# dorian", then "Si♭ major pentatonic" are selected; after the click the focus stays in the
    field.

### Scale and max interval

21. **Action**: Select **Do major**, set **Max interval** to 2, then select **Do major pentatonic**.
    **Expected**: Max interval jumps to "3 semitones" and the slider can no longer go below 3.
22. **Action**: Select **Chromatic**.
    **Expected**: Max interval stays at 3 (never lowered) but the slider can now go down to 1.
23. **Action**: Select **All scales**.
    **Expected**: the slider minimum is 3.

### Reset to defaults

24. **Action**: On Home, change all five settings and move the threshold marker on the mic meter to −25 dB. Open the
    dialog and click **Reset to defaults**.
    **Expected**: Do major, 5 notes, 12 semitones, 1000 ms, 50%. The threshold label still reads "Threshold: −25 dB".

### Persistence

25. **Action**: Set Scale **All majors**, Melody length 7, Max interval 9, Note duration 750 ms, Volume 80%, threshold
    −30 dB. Reload the page (F5).
    **Expected**: all six values are restored (the dialog shows "All majors", not a specific major scale).
26. **Action**: In the console: `JSON.parse(localStorage['trumpet-trainer.settings.v1'])` and
    `localStorage['trumpet-trainer.thresholdDb']`.
    **Expected**: `{ noteDurationMs: 750, melodyLength: 7, volume: 0.8, maxInterval: 9, scaleId: 'group:major' }`
    (key order may differ) and `"-30"`.
27. **Action**: `localStorage.setItem('trumpet-trainer.settings.v1', '{oops'); localStorage.setItem('trumpet-trainer.thresholdDb', '"abc"'); location.reload()`.
    **Expected**: the app loads normally with all defaults and "Threshold: −40 dB".
28. **Action**: Open the app in a private/incognito window, or block site data for localhost (Chrome: Settings →
    Privacy → Third-party cookies → "Sites that can never use cookies" → add `http://localhost:5173`), reload, change
    settings, start an exercise.
    **Expected**: the app works with the defaults; changes apply during the visit (and, with blocked storage, are
    gone after a reload). No errors in the console.

### Melody length, scale and spelling (real exercises)

29. **Action**: Set Melody length 3, Start training.
    **Expected**: 3 boxes; status "Your turn: play note 1 of 3" after playback. Give up.
30. **Action**: Set Melody length 8, Start training on a desktop window.
    **Expected**: 8 boxes in one centered row. Give up.
31. **Action**: Set Scale **Fa major**, Max interval 12, start several exercises and complete or reveal notes.
    **Expected**: all notes belong to Fa major; any Si♭ is shown as "Si♭", never "La#".
32. **Action**: Set Scale **Sol♭ major** and start exercises until a written Si (MIDI 71) appears.
    **Expected**: it is shown as "Do♭5".
33. **Action**: Set Scale **All majors**, start several exercises.
    **Expected**: different exercises use different keys; **Repeat melody** replays exactly the same notes (the key
    does not change within an exercise).
34. **Action**: Set Max interval 1 with **Chromatic**, start an exercise.
    **Expected**: consecutive notes are at most one semitone apart.

### Volume and note duration during training

35. **Action**: Set Volume 50%, Note duration 1500 ms, Start training. While "Listen…" is shown, open the gear.
    **Expected**: the dialog shows only **Note duration** and **Playback volume** and the text "Other settings can be
    changed on the home screen." Playback continues.
36. **Action**: While the melody plays, drag **Playback volume** to 100%, then to 0%.
    **Expected**: the loudness changes immediately on the note that is playing, smoothly (no clicks); at 0% it is
    silent. The melody is not restarted.
37. **Action**: Still during the same exercise, set Note duration 250 ms, close the dialog, wait for "Your turn",
    then click **Repeat melody**.
    **Expected**: the repeated melody plays fast (≈ 0.25 s per note) at the volume set in step 36. Green boxes stay
    green and the active box is unchanged.
38. **Action**: While listening, play the active note correctly with the dialog open.
    **Expected**: the box turns green behind the dialog (listening continues while the dialog is open).
39. **Action**: In the Training dialog click **Reset to defaults**.
    **Expected**: Note duration 1000 ms and Volume 50%; the Home-only settings (scale, length, max interval) are
    unchanged when you return Home and reopen the dialog.
40. **Action**: Open the dialog and leave it open until the exercise completes (play all notes) and the app returns
    Home.
    **Expected**: the dialog stays open and now shows all five Home controls.

### Deterministic `?melody=` (e2e mode, port 5174)

41. **Action**: Open http://localhost:5174/?melody=71,60,72 and Start training.
    **Expected**: 3 boxes regardless of the Melody length setting.
42. **Action**: Open http://localhost:5174/?melody=71,71,71,71,71,71,71,71 and Start training.
    **Expected**: 8 boxes.
43. **Action**: Open http://localhost:5174/?melody=60,60 (2 notes) and http://localhost:5174/?melody=60,60,60,60,60,60,60,60,60 (9 notes), Start training each time.
    **Expected**: the parameter is ignored; a random melody with the Melody length setting is generated.
44. **Action**: On port 5174 select Scale **Fa major**, open http://localhost:5174/?melody=65,70,72, Start, and play
    (or check after completing) the notes.
    **Expected**: names are Fa4, Si♭4, Do5. With Scale **Chromatic** or **All scales** the names follow the MVP
    contextual rule instead.

### Layout

45. **Action**: DevTools device toolbar at 375 × 812 (iPhone X), open http://localhost:5174/?melody=71,71,71,71,71,71,71,71
    and Start.
    **Expected**: 5 boxes on the first row and 3 centered on the second, all the same size, no horizontal scroll.
46. **Action**: Same at 320 px width.
    **Expected**: 4 + 4 boxes, same box size, no horizontal scroll.
47. **Action**: At 375 px open the gear.
    **Expected**: the dialog is a full-width sheet at the bottom with rounded top corners; it scrolls if it is taller
    than the screen (e.g. with the scale list open).
48. **Action**: Repeat steps 1–2, 13 and 36 on a real phone (Android Chrome and iOS Safari) via HTTPS (GitHub Pages
    build or tunnel) and on desktop Firefox.
    **Expected**: same behavior; the gear renders as a monochrome symbol, not a color emoji.

### Production build

49. **Action**: Open http://localhost:4173/trumpet-trainer/, change a setting, reload.
    **Expected**: the setting is restored; `?melody=71,71,71` is ignored (random melody).

### Regression

50. **Action**: Run `npm run lint && npm run typecheck && npm test && npm run test:scripts && npm run build`, then stop
    the servers and run `npm run test:e2e`.
    **Expected**: all pass (1285 unit tests, 32 script tests, 9 e2e tests).
51. **Action**: Re-run Part 1 validation steps 1–12 and 15 (domain modules; step 13–14 now play Do major melodies by
    default, not chromatic ones).
    **Expected**: all pass.

## Appendix B: Re-validation after /t-review #2

Use the servers from `create-environment.sh` (dev on 5173 unless noted).

52. **Action**: Open the gear on Home, click into **Scale** so the list opens, then press and hold the mouse button on
    the list's top padding (just above "Chromatic", inside the list border), release, then press on the list's scrollbar
    and drag it. (review warning: ScaleCombobox.tsx:115-133)
    **Expected**: the list stays open, the Scale input keeps focus (caret visible, typing still filters), and nothing is
    selected. Clicking an option still selects it and keeps focus on the input.
53. **Action**: Reload, open the gear on Home and watch the Scale field; in DevTools run
    `document.activeElement.tagName` and check the Scale input's `aria-expanded` in the Elements panel. With a screen
    reader on (NVDA / VoiceOver), open the gear again. (review suggestion: SettingsDialog.tsx:78-81)
    **Expected**: `DIALOG`; `aria-expanded="false"`; no listbox flashes open; the screen reader announces the
    "Settings" dialog, not an expanded "Scale" combobox. In Elements, `<dialog>` has an `autofocus` attribute.
54. **Action**: Open the Scale list and type `xyz`, then clear it and type `sol`; press Enter. (review suggestion:
    ScaleCombobox.tsx:109)
    **Expected**: `xyz` shows "No matching scales" and Enter does nothing; `sol` activates the first result
    (`Sol major`) and Enter selects it.
55. **Action**: Set **Playback volume** to 35%, close, reload, reopen; then in the console
    `const st = await import('/src/config/settings.ts'); [st.volumeToPercent(0.35), st.percentToVolume(35), st.normalizeSettings({ ...st.DEFAULT_SETTINGS, volume: 0.35 }).volume]`.
    (review suggestion: volume ↔ percent duplicated)
    **Expected**: the slider and text show 35% after the reload; console `[35, 0.35, 0.35]`;
    `grep -rn "\* PERCENT\|/ PERCENT" src --include=*.tsx` finds nothing.
56. **Action**: In the Home dialog, focus **Melody length** and **Max interval** and press → / ← a few times;
    `grep -n "INTEGER_STEP" -r src` (review suggestion: SettingsDialog.tsx:29)
    **Expected**: each key press moves by exactly 1 note / 1 semitone; grep finds nothing; `constants.ts` exports
    `MELODY_LENGTH_STEP` and `MAX_INTERVAL_STEP` (both 1).
57. **Action**: Read `e2e/settings.spec.ts` and run `npm run test:e2e` three times (review suggestions:
    settings.spec.ts:134 and :6-7)
    **Expected**: the 8-box test uses `?melody=60,60,60,60,60,60,60,60` (never matched by the 440 Hz fake mic);
    the storage keys are imported from `src/config/constants.ts`; all 10 e2e tests pass every run.
58. **Action**: `git status --short .claude` and `git check-ignore -v .claude/launch.json` (review suggestion:
    .claude/launch.json)
    **Expected**: `launch.json` is not listed as untracked; `check-ignore` reports the `.gitignore` rule.
59. **Action**: Read `specs/in-app-configuration/implementation-notes.md` "Known issues" (review suggestion:
    implementation-notes.md:138-139)
    **Expected**: it states that Part 1 was released alone as v0.2.0 and that Part 2 needs its own `bump.txt` and
    `CHANGELOG.md` entry; the test count is current.
60. **Action**: Run `npm run lint && npm run typecheck && npm test && npm run test:scripts && npm run build`, stop the
    servers, run `npm run test:e2e`, then re-run every prd2.md validation step (1–51) and Part 1 steps 1–12 and 15.
    **Expected**: all pass (1297 unit tests, 32 script tests, 10 e2e tests); no behavior changed except the fixes above.
