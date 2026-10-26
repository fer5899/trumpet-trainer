# Human Validation — prd.md

Part 1 adds the pure core of the pitch feedback graph (smoother, hold tracker, graph model + view) and the new
training rules (smoothed pitch, any held note gives a result, a 500 ms `reveal` pause after each correct note). There
is **no graph and no overlay yet** (they arrive with prd2.md). The pure modules are checked from the browser DevTools
console (the Vite dev server serves source files, so they can be imported directly); the training rules are checked in
the app with a real tone.

## Prerequisites

Start the test environment:

```bash
bash specs/pitch-feedback-graph/create-environment.sh
```

- Open http://localhost:5173/ in Chrome, open DevTools → Console (steps 1–14).
- For steps 15–26 use the e2e-mode server on http://localhost:5174/ with a fixed melody. Written Si4 (`71`) sounds
  concert A4 = **440 Hz**; written Do5 (`72`) sounds concert Si♭4 = **466.16 Hz**. Play them on a B♭ trumpet, or use
  any tone generator (phone app or website) through a speaker near the microphone. Set the threshold on Home so the
  tone is above it and room noise below it.

## Validation Steps

### Constants

1. **Action**: `const c = await import('/src/config/constants.ts'); [c.CENTS_PER_SEMITONE, c.NOTE_REVEAL_MS, c.PITCH_SMOOTHING_MS, c.PITCH_TRAIL_MS, c.PITCH_GRAPH_RANGE_CENTS, c.PITCH_GRAPH_DOT_X, c.PITCH_GRAPH_GUIDE_CENTS, c.PITCH_GRAPH_VIEWBOX_WIDTH, c.PITCH_GRAPH_VIEWBOX_HEIGHT, c.PITCH_GRAPH_DOT_RADIUS]`
   **Expected**: `[100, 500, 50, 1000, 50, 0.8, 12.5, 320, 200, 6]`.

2. **Action**: `[c.TOLERANCE_CENTS, c.SUSTAIN_MS, c.DEFAULT_THRESHOLD_DB]`
   **Expected**: `[25, 500, -40]` (unchanged).

### Note helpers

3. **Action**: `const n = await import('/src/music/notes.ts'); [n.hzToMidi(440), n.hzToMidi(220), n.hzToMidi(443).toFixed(4), n.hzToMidi(446.5).toFixed(4)]`
   **Expected**: `[69, 57, '69.1176', '69.2539']`.

4. **Action**: `[[69.5, 68.5, 68.49, 69.49].map(n.nearestMidi), [69.5, 68.5, 69.25, 69.49].map((m) => Math.round(n.centsOffset(m)))]`
   **Expected**: `[[70, 69, 68, 69], [-50, -50, 25, 49]]` (exact half-semitone ties go up).

### Pitch smoother

5. **Action**: `const ps = await import('/src/audio/pitchSmoother.ts'); const s = ps.createPitchSmoother(); [s.push(0, 69), s.push(20, 70).toFixed(4)]`
   **Expected**: `[69, '69.3297']` (first reading unchanged, then α = 1 − e^(−20/50)).

6. **Action**: `[s.push(40, null), s.push(60, 70)]`
   **Expected**: `[null, 70]` (a gap resets it; the next reading is used unchanged).

7. **Action**: `const run = (step) => { const x = ps.createPitchSmoother(); let v = x.push(0, 69); for (let t = step; t <= 100; t += step) v = x.push(t, 70); return v.toFixed(4); }; [run(10), run(20)]`
   **Expected**: `['69.8647', '69.8647']` (frame-rate independent).

### Hold tracker

8. **Action**: `const h = await import('/src/training/holdTracker.ts'); const tr = h.createHoldTracker(); const out = []; for (let t = 0; t <= 520; t += 20) { const r = tr.push({ timeMs: t, midi: 69 }, []); if (r.completed !== null || t === 240) out.push([t, r.progress, r.completed]); } out`
   **Expected**: `[[240, 0.48, null], [500, 1, 69]]` — progress grows with the hold and `completed` fires once, at 500 ms
   (not again at 520).

9. **Action**: `const w = h.createHoldTracker(); let done = null; for (let t = 0; t <= 2000; t += 20) done ??= w.push({ timeMs: t, midi: 69 }, [69]).completed; [done, w.push({ timeMs: 2020, midi: 69 }, [69]).progress]`
   **Expected**: `[null, 0]` (a note in `wrongNotes` never fills or completes).

10. **Action**: `const o = h.createHoldTracker(); let first = null; for (let t = 0; t <= 600; t += 20) { const r = o.push({ timeMs: t, midi: 57 }, []); if (r.completed !== null && first === null) first = [t, r.completed]; } first`
    **Expected**: `[500, 57]` (any note completes, including an octave of the expected one; the hook judges it).

### Pitch graph model and view

11. **Action**: `const g = await import('/src/training/pitchGraph.ts'); [g.PITCH_GRAPH_BAND_HALF_HEIGHT, g.PITCH_GRAPH_GUIDE_LEVELS]`
    **Expected**: `[0.5, [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]]`.

12. **Action** (Fa/Mi/Fa example, idea §4.3):
    `const feed = (until) => { let m = g.EMPTY_PITCH_GRAPH_MODEL; for (let t = 0; t <= until; t += 20) m = g.advancePitchGraph(m, { timeMs: t, midi: t < 200 || t >= 700 ? 65 : 64 }); return m; }; const show = (m) => { const v = g.computePitchGraphView(m, { progress: 0, wrongNotes: [], revealing: false }); return [m.centre, v.segments.map((s) => s.map((p) => p.x.toFixed(3) + ',' + p.y.toFixed(2)).filter((_, i, a) => i === 0 || i === a.length - 1)), v.dot]; }; [show(feed(900)), show(feed(600))]`
    **Expected**: at now 900: centre `65`, two segments `['0.080,0.00', '0.232,-1.00']` and `['0.632,-1.00', '0.800,0.00']`,
    dot `{x: 0.8, y: 0}`. At now 600: centre `64`, one segment `['0.472,1.00', '0.800,0.00']`.

13. **Action**: `let q = g.EMPTY_PITCH_GRAPH_MODEL; for (let t = 0; t <= 200; t += 20) q = g.advancePitchGraph(q, { timeMs: t, midi: 70 }); for (let t = 220; t <= 2220; t += 20) q = g.advancePitchGraph(q, { timeMs: t, midi: null }); [q.centre, g.computePitchGraphView(q, { progress: 0, wrongNotes: [70], revealing: false })]`
    **Expected**: `[70, { segments: [], dot: null, bandState: 'red', fill: 0 }]` (the trail aged out, the centre and its
    red colour persist through silence).

14. **Action**: `const p = g.advancePitchGraph(g.EMPTY_PITCH_GRAPH_MODEL, { timeMs: 0, midi: 69 }); ['revealing', 'red', 'filling', 'idle'].map((k) => { const v = g.computePitchGraphView(p, { progress: k === 'filling' || k === 'red' ? 0.4 : 0, wrongNotes: k === 'red' ? [69] : [], revealing: k === 'revealing' }); return v.bandState + ' ' + v.fill; })`
    **Expected**: `['green 0', 'red 0', 'filling 0.4', 'idle 0']`.

### Correct note: reveal pause (app, e2e mode)

15. **Action**: Open http://localhost:5174/?melody=71,71,71, press **Start training**, wait for "Your turn: play note 1
    of 3", then play 440 Hz steadily.
    **Expected**: after about 0.5 s the first box turns green ("Si4") and the status changes **immediately** to "Your
    turn: play note 2 of 3".

16. **Action**: Right after step 15's box turns green, look at the buttons.
    **Expected**: for about half a second **Repeat melody** is disabled and **Give up** stays enabled; then Repeat
    melody becomes enabled again.

17. **Action**: Restart (Give up → Start training) and keep playing 440 Hz **without stopping** through all three notes.
    **Expected**: the boxes turn green roughly one second apart (0.5 s hold + 0.5 s reveal pause), not every 0.5 s: the
    tail of one note never counts for the next.

18. **Action**: After the third box turns green, stop playing and watch.
    **Expected**: the status shows "Well done!" at once; about 2 s later (0.5 s reveal + 1.5 s pause) the app returns
    Home.

19. **Action**: Start http://localhost:5174/?melody=71,71,71 again, match the first note, and click **Give up** during
    the half-second right after the box turns green.
    **Expected**: the app returns Home at once; no error, and it does not come back to Training.

### Wrong note (app, e2e mode)

20. **Action**: Open http://localhost:5174/?melody=71,72,72, Start, match the first note with 440 Hz, wait for "play
    note 2 of 3", then keep playing **440 Hz** for 2 s.
    **Expected**: nothing advances (440 Hz is concert A4, but the expected note Do5 sounds 466.16 Hz). No visual red mark
    yet (that is Part 2).

21. **Action**: Switch to **466.16 Hz** and hold it.
    **Expected**: the second box turns green ("Do5") after about 0.5 s.

22. **Action**: Restart with ?melody=71,71,71 and play **220 Hz** (concert A3, the right note an octave down) for 2 s.
    **Expected**: nothing advances (octave errors are wrong notes).

23. **Action**: While stuck on a wrong note as in step 20, click **Repeat melody**, wait for the playback and the guard,
    then play the right tone.
    **Expected**: the melody replays, progress (green boxes) is kept, and the right tone is accepted after a fresh
    0.5 s.

### Smoothing (app)

24. **Action**: On http://localhost:5174/?melody=71,71,71, hold 440 Hz with a gentle vibrato or a slightly unsteady tone
    (small wobbles around the pitch).
    **Expected**: the note is still accepted after about 0.5 s; brief wobbles do not restart the hold.

25. **Action**: Play the note with a clear stop in the middle (e.g. 0.3 s, a short silence, 0.3 s).
    **Expected**: no acceptance from the two halves; a gap (silence or below threshold) still restarts the hold, and
    the note is accepted only after 0.5 s of continuous tone.

### Regressions

26. **Action**: Open http://localhost:5173/ (random melody), open Settings during training and change the volume, then
    play through a whole exercise; also open http://localhost:4173/trumpet-trainer/ and start an exercise.
    **Expected**: training works as before apart from the 0.5 s pause after each correct note; the volume applies at
    once; the production preview loads and plays.

---

# Human Validation — prd2.md

Part 2 adds what the user sees: the live pitch graph below the Training buttons (trail, leading dot, tolerance band
that fills, turns green or red), the reveal overlay card with the note name, theme colours, and the e2e updates.

## Prerequisites

Start the test environment:

```bash
bash specs/pitch-feedback-graph/create-environment.sh
```

- Use the e2e-mode server on http://localhost:5174/ for fixed melodies (steps 1–27) and the normal dev server on
  http://localhost:5173/ for random melodies (steps 28–31). The production preview is on
  http://localhost:4173/trumpet-trainer/ (step 32).
- Written Si4 (`71`) sounds concert A4 = **440 Hz**; written Do5 (`72`) sounds concert Si♭4 = **466.16 Hz**; 220 Hz is
  the right note an octave down. Play them on a B♭ trumpet or use a tone generator (phone app or website) through a
  speaker near the microphone. On Home, set the threshold so the tone is above it and room noise below it.
- For DOM checks open DevTools → Elements (or Console with `document.querySelector('[data-testid="pitch-graph"]')`).
- Steps 22–26 also need: DevTools → Rendering → "Emulate CSS media feature prefers-color-scheme" and
  "prefers-reduced-motion", and DevTools device toolbar (responsive, 320 px wide). Steps 33–34 need a phone and a
  screen reader (VoiceOver / TalkBack / NVDA).

## Validation Steps

### Graph layout and empty state

1. **Action**: Open http://localhost:5174/?melody=71,71,71,71,71 and press **Start training**.
   **Expected**: below **Repeat melody** / **Give up** there is a graph as wide as the column, with a grey band
   across the middle (half of the graph height), a solid centre line and six dashed guide lines. No trail, no dot,
   no text, numbers or note names anywhere on the graph.

2. **Action**: In DevTools, inspect the graph (`data-testid="pitch-graph"`).
   **Expected**: it is an `<svg>` with `aria-hidden="true"` and `data-band-state="idle"`.

3. **Action**: While the melody plays (status "Listen…") and during "Get ready…", play 440 Hz.
   **Expected**: the graph stays empty: no dot, no trail (the microphone is ignored while the melody plays and during
   the guard). Nothing jumps when the status changes.

### Dot, trail and time scale

4. **Action**: When the status shows "Your turn: play note 1 of 5", play 440 Hz slightly sharp, then slightly flat
   (or bend the pitch up and down a little with the trumpet).
   **Expected**: a dot appears at about 80 % of the width; it moves **up** when sharp and **down** when flat, and
   follows smoothly (no jitter). A trail to its left shows the last second of pitch; the 20 % on the right of the dot
   stays empty.

5. **Action**: Stop playing and watch the graph for about 2 s.
   **Expected**: the dot disappears at once; the trail keeps scrolling left and is completely gone about 1 s after
   the tone stopped. The band keeps its colour (grey).

6. **Action**: Play a tone far outside the band (e.g. about +40 c, or slide slowly from one note to the next one).
   **Expected**: the trail leaves through the top/bottom edge instead of jumping across the graph; when the pitch
   passes half a semitone the graph re-centres on the neighbour note and the dot appears near the opposite edge,
   still moving the same way.

### Filling and correct note

7. **Action**: Play 440 Hz steadily, in tune.
   **Expected**: while in tune the band fills with a muted yellow (different from the trail) from left to right and
   reaches the full width after about 0.5 s; in DevTools `data-band-state` is `filling` while it fills.

8. **Action**: Start filling, then go out of tune by more than a quarter tone (or stop) before 0.5 s.
   **Expected**: the fill disappears at once (back to an empty grey band).

9. **Action**: Hold 440 Hz until the fill completes.
   **Expected**: the band turns **green**, and at the same moment a large green card with **Si4** appears in the
   centre of the screen; everything behind it (status, boxes, buttons, gear, graph) is dimmed and blurred. The first
   box is already green with "Si4" and the status already reads "Your turn: play note 2 of 5".

10. **Action**: Keep playing 440 Hz while the card is visible.
    **Expected**: no dot appears and nothing fills while the card is shown; the band stays green.

11. **Action**: Watch the card.
    **Expected**: it disappears by itself after about half a second; the band goes back to grey, listening resumes
    and the next note can be filled.

12. **Action**: While the card is visible, look at the buttons.
    **Expected**: **Repeat melody** is disabled; **Give up** stays enabled.

13. **Action**: Keep playing 440 Hz through all five notes.
    **Expected**: each note shows the card "Si4" for half a second; after the fifth the status shows "Well done!" with
    all boxes green, then (about 1.5 s after the card goes) the app returns Home.

14. **Action**: Start http://localhost:5174/?melody=71,60,60,60,60, match the first note with 440 Hz, and click or tap
    **Give up** while the card is visible.
    **Expected**: the click goes through the dimmed screen: the app returns Home at once and does not come back to
    Training.

15. **Action**: Open http://localhost:5174/?melody=54,66,71 (Fa#3, Fa#4, Si4) and match the first note with its tone
    (concert Mi3 = 164.81 Hz) or play written Fa#3 on the trumpet.
    **Expected**: the card shows the note spelled exactly as in its first box once it turns green (a sharp or flat
    spelling such as "Fa#3" or "Sol♭3"; card and box always match).

### Wrong notes (red band)

16. **Action**: Open http://localhost:5174/?melody=71,72,72, Start, match the first note with 440 Hz, wait for "play
    note 2 of 3", then keep playing **440 Hz**.
    **Expected**: the band fills, then turns **red** after about 0.5 s (no fill visible on red). No card appears, the
    boxes and the status do not change, and nothing is announced.

17. **Action**: Keep holding 440 Hz for 2 more seconds.
    **Expected**: the band simply stays red (nothing more happens).

18. **Action**: Stop playing and wait 2 s.
    **Expected**: the dot and then the trail disappear, but the band stays **red** (the graph is still centred on that
    note).

19. **Action**: Click **Repeat melody** and watch the graph during "Listen…", "Get ready…" and back in "Your turn".
    **Expected**: the band stays red throughout; playing 440 Hz again shows red at once (no filling).

20. **Action**: Play **466.16 Hz** (the right note, Do5) and hold it.
    **Expected**: the graph re-centres (band grey, filling), turns green, and the card shows "Do5". After the card
    goes, play 440 Hz again: the band is grey and fills again (red marks were cleared by the correct note).

21. **Action**: Restart with ?melody=71,71,71 and play **220 Hz** (octave down) until the fill completes.
    **Expected**: red band (octave errors are wrong notes); no card.

### Theme, width and motion

22. **Action**: Emulate `prefers-color-scheme: dark` and repeat steps 4, 7, 9 and 16.
    **Expected**: dark graph background, light grey band, bright yellow trail, white dot, olive fill, dark green /
    dark red bands, bright green card with dark text, a strong dim layer, as in the mockups.

23. **Action**: Emulate `prefers-color-scheme: light` and repeat steps 4, 7, 9 and 16.
    **Expected**: white graph background, light-grey band, amber trail, dark dot, pale gold fill, pastel green / red
    bands, light green card with dark green text, a lighter dim layer; everything readable.

24. **Action**: In the device toolbar set the width to 320 px and start an exercise.
    **Expected**: the graph fits the column (about 288 × 180 px), the page has no horizontal scroll, and the card fits
    on screen.

25. **Action**: Emulate `prefers-reduced-motion: reduce` and match a note.
    **Expected**: the dim layer and the card appear instantly, without fade or scale animation.

26. **Action**: Without reduced motion, match a note and watch closely.
    **Expected**: the dim layer fades in quickly and the card pops in (fade + slight scale up); it disappears without
    an exit animation.

27. **Action**: During the card, click the gear (Settings).
    **Expected**: the Settings dialog opens above the dimmed screen and works normally.

### Random melodies and regressions

28. **Action**: Open http://localhost:5173/, Start training and play through a random melody on the trumpet.
    **Expected**: the dot follows intonation smoothly, sharp/flat move up/down, a held note fills in about 0.5 s,
    correct notes show the green card with the right name, wrong notes turn red.

29. **Action**: Play a wrong note until red, then the right one.
    **Expected**: the red note stays red after **Repeat melody**; the correct note shows the green card, then the band
    is grey and listening resumes.

30. **Action**: Slide slowly from one note to its neighbour (lip bend or valve half-press).
    **Expected**: the graph wraps to the neighbour note without the line jumping across the graph.

31. **Action**: Open Settings during training and change the volume and the note duration; press Repeat melody.
    **Expected**: the volume changes at once, the duration applies on the Repeat, progress and red marks are kept, and
    the graph keeps working.

32. **Action**: Open http://localhost:4173/trumpet-trainer/ and start an exercise.
    **Expected**: the production build shows the graph and the overlay with the same colours and behaviour.

### Phone and accessibility

33. **Action**: On a phone (iOS Safari and Android Chrome, via the deployed GitHub Pages build or an HTTPS tunnel; a
    LAN IP is not a secure context), play an exercise and tap **Give up** while the card is visible.
    **Expected**: the dim + blur covers the screen (iOS uses the `-webkit-` prefix), the card is centred and readable,
    and Give up responds to the tap.

34. **Action**: With a screen reader on, match a note, then hold a wrong note until red.
    **Expected**: the revealed name (e.g. "Si4") is announced once, together with the advanced status text; the graph
    is not read out, and wrong notes are never announced.

---

## Appendix A: Re-validation after /t-review #1

These checks cover the 8 review suggestions fixed by `/t-reduce-tech-debt` (`review.md`; item 9, `bump.txt` +
CHANGELOG, is deferred to `/t-prepare-pr`). Steps continue the prd2.md numbering. Use the same environment as above.

35. **Action** (review suggestion: useTrainingSession.test.tsx:501-503): `npx vitest run src/training/useTrainingSession.test.tsx`.
    **Expected**: all tests pass; the "jump from the semitone above" test checks `matchedCount` only once.

36. **Action** (review suggestion: duplicated `detune`): `grep -rn "const detune" src/` and
    `npx vitest run src/components/App.test.tsx src/training/useTrainingSession.test.tsx`.
    **Expected**: only one definition, exported from `src/test/sessionDriver.ts` and based on `CENTS_PER_OCTAVE`; both
    test files import it and pass.

37. **Action** (review suggestion: e2e overlay checks): `npm run test:e2e -- e2e/training.spec.ts` (stop other servers
    on 5173 first, or point Playwright at the e2e-mode server on 5174).
    **Expected**: 3/3 pass; the card text and the Give up hit test are each checked in a single `page.waitForFunction`.

38. **Action** (review suggestion: pitchGraph.ts single copy): in the DevTools console of http://localhost:5173/, re-run
    Part 1 steps 12 and 13. Then run
    `const g = await import('/src/training/pitchGraph.ts'); const m0 = g.advancePitchGraph(g.EMPTY_PITCH_GRAPH_MODEL, { timeMs: 0, midi: 69 }); const m1 = g.advancePitchGraph(m0, { timeMs: 20, midi: null }); const m2 = g.advancePitchGraph(m1, { timeMs: 2000, midi: null }); [m0.readings.length, m1.readings.length, m1.readings !== m0.readings, m2.readings.length, m2.centre]`.
    **Expected**: steps 12 and 13 give the same results as before. The command returns `[1, 2, true, 0, 69]`: the gap
    marker is added after a valid reading, the input array is never reused, a lone gap marker never starts the trail,
    and the centre persists.

39. **Action** (review suggestion: PitchGraph static guides): on http://localhost:5174/?melody=71,71,71,71,71 start
    training and inspect the graph.
    **Expected**: still exactly 6 dashed guide lines and one centre line at the same positions as in Part 2 step 1;
    they don't move while a tone plays.

40. **Action** (review suggestion: redundant band selectors in styles.css): repeat Part 2 steps 7, 9 and 16 in the
    dark and the light theme.
    **Expected**: the idle and filling band is the same grey as before, and the green and red bands are unchanged.

41. **Action** (review suggestion: TrainingScreen status template): match note 1 on ?melody=71,71,71.
    **Expected**: the status reads "Your turn: play note 1 of 3" while listening, "Your turn: play note 2 of 3" at once
    during the card, and "Well done!" after the last note.

42. **Action** (review suggestion: CLAUDE.md wrapping): `awk 'length > 100' CLAUDE.md`.
    **Expected**: none of the lines added by this feature are listed; only lines that were already long before it
    remain.

43. **Action** (regression): re-run all the original validation steps (prd.md steps 1–26 and prd2.md steps 1–34), plus
    `npm test`, `npm run lint` and `npm run typecheck`.
    **Expected**: every step behaves as in validation Run 2, and all three commands pass.
