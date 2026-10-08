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

