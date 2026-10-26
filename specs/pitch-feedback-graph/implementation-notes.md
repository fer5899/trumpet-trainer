# pitch-feedback-graph Pitch feedback graph

# Implementation notes

# prd.md implementation

Part 1 of 2 (`specs/pitch-feedback-graph/prd.md`). Part 2 (`prd2.md`: graph store, hook graph wiring, `PitchGraph`,
`NoteRevealOverlay`, layout, CSS tokens, component tests, e2e) is implemented too: see "prd2.md implementation" below.

## Requirements

| # | Requirement (prd.md) | Status |
|---|---|---|
| 1 | New constants `CENTS_PER_SEMITONE`, `NOTE_REVEAL_MS`, `PITCH_SMOOTHING_MS`, `PITCH_TRAIL_MS`, `PITCH_GRAPH_RANGE_CENTS`, `PITCH_GRAPH_DOT_X`, `PITCH_GRAPH_GUIDE_CENTS`, `PITCH_GRAPH_VIEWBOX_WIDTH/HEIGHT`, `PITCH_GRAPH_DOT_RADIUS` with doc comments; rows in `constants.test.ts` | Implemented |
| 2 | `hzToMidi`, `nearestMidi` (ties up), `centsOffset` reproduce the table | Implemented |
| 3 | Pitch smoother: first reading after create / reset / null unchanged; α = 1 − e^(−Δt/τ); frame-rate independent; Δt ≤ 0 keeps the value | Implemented |
| 4 | Hold tracker replaces the sustain tracker: every ported case, nearest-semitone runs, resets (no pitch, out of tolerance, nearest-note change, wrong note), once per run, progress | Implemented; `sustainTracker.ts` + test deleted, no imports left |
| 5 | Graph model: pruning, gap markers, centre persistence; view: clipping, Fa/Mi/Fa points, dot, band precedence, fill, `trailMs` only scales X, `viewsEqual`, guide levels, band half-height | Implemented (one test-row deviation, see Initial considerations) |
| 6 | Reducer: `reveal` phase, `wrongNotes`, `wrongNoteHeld` / `revealElapsed`, 24 ignored pairs (same reference), `selectExpectedNote`, `selectCanRepeat`, `selectCanGiveUp`, `selectRevealedName`; `selectCanAct` removed | Implemented |
| 7.1 | Hook: `canRepeat` / `canGiveUp`, per-session tracker + smoother, `dispatchNow` + `stateRef`, reveal timer, one mic subscription for the whole session, frame handler as specified | Implemented |
| 7.2 | `TrainingScreen`: `reveal` status text, Repeat `!canRepeat`, Give up `!canGiveUp` | Implemented |
| 7.3 | `sessionDriver`: `reveal()`, `matchNote()` | Implemented |
| AC hook | one listener from mount to release; detector never called outside listening / below threshold; steady tone accepted at first frame + 500 ms; reveal 500 ms with box done, status advanced, Repeat off / Give up on; reveal frames never fill or match; wrong notes (incl. octave) recorded, kept by Repeat, cleared by the correct note; last note → reveal → complete → exit; Give up during reveal exits once, no timer left | Implemented and tested |
| Tests | `useTrainingSession.test.tsx` and `App.test.tsx` updates listed in "Testing Decisions — Part 1", incl. smoothing and render-count tests | Implemented |
| e2e | No change needed | Confirmed: all 10 e2e specs pass unchanged |
| Docs | CLAUDE.md / README.md | Updated (see Documentation updates) |

## Initial considerations

- **PRD test-row off-by-one (decision).** The "silence ages out" row says *segments until t 1200 inclusive, none at
  1220* for 69 at t 0..200 then silence. With the explicit pruning rule (drop readings with `nowMs − t > trailMs`), at
  t 1200 only the reading at t 200 is left (t 180 is 1020 ms old), and a single reading draws no polyline. The rule and
  the `PitchGraphModel` invariant (`nowMs − timeMs <= trailMs`) are explicit, so the rule wins: the last frame with a
  segment is **t 1180**, none from t 1200. The test documents this. The visual difference is one frame (20 ms).
  Alternative considered and rejected: keeping one reading older than the window and clipping at x = 0 (smoother
  disappearance, but it breaks the documented invariant and the pruning test row).
- **Smoothing vs idea §8** is the user-requested deviation already recorded in the PRD; implemented as specified.
- `git rm` was not used to stage anything: the sustain tracker files are deleted from the working tree only (nothing
  committed or staged).

## Design

```
mic frame (every phase, ONE subscription)
  └─ stateRef.current.phase !== 'listening' → ignored (no level, no detector)
  └─ listening: computeLevelDb ≥ threshold ? detectPitch : null
        → hzToMidi → smoother.push (EMA, τ 50 ms; null resets)
        → tracker.push({ timeMs, midi }, wrongNotes)   (nearest semitone, ±25 c, 500 ms)
        → completed === selectExpectedNote ? noteMatched : wrongNoteHeld(midi)
              └─ dispatchNow: pure reducer on stateRef (sync) → tracker/smoother reset on phase change → dispatch

phases: playing → guard → listening ⇄ reveal (NOTE_REVEAL_MS timer) → complete (COMPLETE_PAUSE_MS → exit)
                          listening → playing (Repeat; wrongNotes kept)
```

The graph model/view (`pitchGraph.ts`) is pure and fully tested but not wired yet: Part 2 adds the store, feeds
`advancePitchGraph` from the same frame handler and draws `computePitchGraphView` in `PitchGraph`.

## Implementation details

- `src/config/constants.ts`: new constants in the documented groups (tuning, exercise, pitch detection, a new
  "Pitch feedback graph" group). Viewbox / radius constants are unused until Part 2.
- `src/music/notes.ts`: `hzToMidi` (inverse of `midiToHz`), `nearestMidi` (`Math.round`, ties up), `centsOffset`.
  `centsFrom` unchanged.
- `src/audio/pitchSmoother.ts` (new): closure with `value` / `lastMs`; `dt = max(0, …)` so time going backwards keeps
  the value.
- `src/training/holdTracker.ts` (new): single `run` (`note`, `startMs`, `done`); no target and no threshold (level
  gating happens before smoothing in the hook).
- `src/training/pitchGraph.ts` (new): `advancePitchGraph` returns a new model (never mutates); gap marker appended only
  after a valid reading; prune by age then drop leading markers. `computePitchGraphView` splits readings into runs at
  markers, clips each pair to `[−1, 1]` (`clipPair`), and joins consecutive pieces when the shared reading is inside
  (pieces reuse the same point object, so the join test is an identity check). Without a centre it returns the shared
  `EMPTY_PITCH_GRAPH_VIEW` object (or a copy with `bandState: 'green'` while revealing). Guide levels are derived from
  `PITCH_GRAPH_GUIDE_CENTS / PITCH_GRAPH_RANGE_CENTS`.
- `src/training/trainingReducer.ts`: `reveal` phase, `wrongNotes`, `selectExpectedNote` (used by the reducer's
  "expected note is never red" invariant and by the hook), new selectors; `selectCanAct` removed.
- `src/training/useTrainingSession.ts`: `dispatchNow` + `stateRef` exactly as in the PRD; effects: playing (no more
  `tracker.reset()`, the phase change does it), guard, reveal (new), mic frames (one subscription, deps
  `[mic, services, thresholdDb, tracker, smoother, dispatchNow]`), complete, unmount release (unchanged, StrictMode
  safe). Returns `canRepeat` / `canGiveUp`.
- `src/components/TrainingScreen.tsx`: `reveal` status text (already-incremented count; "Well done!" after the last
  note); buttons use the new flags.
- `src/test/sessionDriver.ts`: `reveal()` and `matchNote(hz)`.

## Tests

Unit/component suite: **1432 tests in 30 files** (was 1297; the sustain tracker test file was removed and three test
files were added).

- `src/config/constants.test.ts`: 10 new constant rows.
- `src/music/notes.test.ts`: `hzToMidi` table + inverse property; `nearestMidi` / `centsOffset` table (ties, exact
  +25 c, range `[−50, +50)` sweep).
- `src/audio/pitchSmoother.test.ts` (new, 14): every PRD row.
- `src/training/holdTracker.test.ts` (new, 15): all ported sustain cases + nearest-note change, tie, wrong notes,
  run broken by becoming wrong.
- `src/training/pitchGraph.test.ts` (new, 38): every PRD row incl. Fa/Mi/Fa at now 900 / 600 (every point checked),
  wrap without gap, opposite edges, same edge, single reading, red persistence, band precedence table, `trailMs`
  2000, `viewsEqual` per differing field, immutability, leading-marker drop.
- `src/training/trainingReducer.test.ts`: 5 phases × 6 actions, 24 ignored pairs (same reference), reveal transitions,
  `wrongNoteHeld` (append, order, duplicate, expected note), Repeat keeps red marks, all selectors per phase,
  `selectNoteBoxes` in reveal.
- `src/training/useTrainingSession.test.tsx`: updated `canAct` → `canRepeat`/`canGiveUp`, listener count 1 from mount,
  reveal between matches; new suites for reveal (timing with `TIMER_DRIFT_MARGIN_MS`, Repeat ignored, reveal frames
  ignored + detector not called, one listener in every phase, Give up during reveal with `vi.getTimerCount()` 0),
  wrong notes (semitone, octaves, kept by Repeat, cleared by the right note), smoothing (+35 c frame, jump from the
  semitone above accepted at 4th target frame + 500 ms, below-threshold gap still resets), render count (20 frames →
  0 renders).
- `src/components/App.test.tsx`: loops use `matchNote`; Repeat test waits the reveal; new tests for the reveal
  (status advanced, Repeat disabled, Give up enabled, same pitch during reveal ignored) and Give up during the reveal;
  the "complete" test checks the last reveal ("Well done!" at once, Give up enabled) before `COMPLETE_PAUSE_MS`.
- e2e: unchanged, 10/10 pass (each note now takes 0.5 s longer).

## Documentation updates

- `CLAUDE.md`: status line for pitch-feedback-graph (Part 1 implemented, Part 2 pending); architecture map entries for
  `pitchSmoother.ts`, `holdTracker.ts`, `pitchGraph.ts` (replacing `sustainTracker.ts`), new note helpers and constants,
  reducer (`reveal`, `wrongNotes`, new selectors), hook (one subscription, `dispatchNow` / `stateRef`), session driver
  (`reveal` / `matchNote`), `TrainingScreen` flags; new "Judging pitch" convention.
- `README.md`: "How it works" step 4 mentions smoothing, the 0.5 s pause after each correct note and that a wrong note
  does not advance.

## Performance

- Frames outside `listening` return before computing the level or running the detector, so playback / guard / reveal
  cost nothing more than before.
- The frame handler only dispatches on a result; 20 listening frames cause no React re-render (tested). Part 2 will
  publish the graph view through an external store so only the graph re-renders per frame.
- `advancePitchGraph` copies the reading array per frame (≈ 50–60 entries at 1 s of trail); negligible.

## Known issues

- ~~No UI for the graph, the red marks or the reveal overlay yet~~: resolved by Part 2 (`prd2.md`).
- The "silence ages out" PRD row is off by one frame relative to the pruning rule; the implementation follows the
  rule (see Initial considerations). Part 2 should keep this in mind for any graph timing assertions.
- `create-environment.sh` runs `./node_modules/.bin/vite` directly so cleanup kills the servers; on Windows Git Bash
  that file is a shell shim, so if a server survives Ctrl+C, stop it from the task manager (not verified on Windows).

---

# prd2.md implementation

Part 2 of 2 (`specs/pitch-feedback-graph/prd2.md`): the graph store, the hook's graph wiring, the `PitchGraph` SVG,
the `NoteRevealOverlay`, `TrainingScreen` layout, CSS tokens and rules, component tests and e2e.

## Requirements

| # | Requirement (prd2.md) | Status |
|---|---|---|
| 8 | `src/training/pitchGraphStore.ts`: `getSnapshot` / `subscribe` (idempotent unsubscribe) / `publish` (skips `viewsEqual` views, keeps the reference); default `EMPTY_PITCH_GRAPH_VIEW`; no React | Implemented |
| 9 | Hook: `graph` (stable, `useState`), `revealedName`, `graphModelRef`, `progressRef`, `publishGraph`, `progressRef = 0` on phase change in `dispatchNow`, frame handler advancing the graph in every phase **after** the dispatch, sync effect on `[phase, wrongNotes, publishGraph]` | Implemented |
| 10 | `src/components/PitchGraph.tsx`: `useSyncExternalStore`, SVG markup / test ids / classes as specified, 2-decimal rounding, no text | Implemented |
| 11 | `src/components/NoteRevealOverlay.tsx`: always-mounted `role="status"` region, backdrop (`aria-hidden`) + card | Implemented |
| 12 | `TrainingScreen`: graph always rendered below the actions, overlay after it; no new strings | Implemented |
| 13 | CSS: 13 light/dark tokens, graph rules (`vector-effect: non-scaling-stroke`), overlay rules (fixed, z-index 10/11, blur with `-webkit-` prefix, `pointer-events: none`, fade / pop keyframes), reduced motion | Implemented |
| AC Graph | every phase, aria-hidden, no text, 320 px fit; idle before pitch; dot cx 256 / cy from cents; trail ages out; filling width = progress × 320; green until the reveal ends; red (incl. octave) persists through silence and Repeat, cleared by the correct note; only `PitchGraph` re-renders per frame | Implemented and tested (320 px fit checked ad hoc in Chromium: graph 288 × 180.75 px, `scrollWidth` 320) |
| AC Overlay | name in the status region, box done, status advanced, Repeat off / Give up on; timing with `TIMER_DRIFT_MARGIN_MS`; reveal frames never fill or show a dot; Give up through the overlay (e2e hit test); last note → overlay → Well done! → Home | Implemented and tested; reduced motion is CSS only (manual checklist) |
| AC Theme | every graph / overlay colour is a token with light and dark values | Implemented |
| E2E | `training.spec.ts`: matching melody with the overlay per note, wrong note red kept through Repeat, Give up during the overlay | Implemented; 11/11 e2e pass |
| Docs | CLAUDE.md updates section; README | Updated |

## Initial considerations

- **Order of the reveal hit test in e2e.** The overlay lives 500 ms; the hit test and the "overlay present" check run
  in one `evaluate` right after the in-page `waitFor`, so both are measured on the same task, as the PRD prescribes.
- **Smoother vs. the App test "after the correct note".** Jumping straight from the wrong semitone to the correct note
  delays acceptance by a few frames (EMA settling, a Part 1 behaviour), so `matchNote` (exactly `SUSTAIN_MS`) would not
  complete it. The test emits one null frame first (resets the smoother), as a real player stopping between notes.
- No contradictions found between prd2.md, idea.md and the mockups; no deviations.

## Design

```
mic frame (every phase, ONE subscription)
  ├─ listening: level → detector → hzToMidi → smoother → tracker → progressRef = hold.progress
  │     └─ completed? dispatchNow(noteMatched | wrongNoteHeld)   (phase change → progressRef = 0)
  │  other phases: midi = null, progressRef = 0
  └─ graphModelRef = advancePitchGraph(model, { timeMs, midi })
     publishGraph(): store.publish(computePitchGraphView(model, { progress, wrongNotes, revealing }))
                        └─ viewsEqual? skip : notify → PitchGraph (useSyncExternalStore) re-renders

sync effect [phase, wrongNotes] → publishGraph()   (green → grey after the reveal without a frame)

TrainingScreen (renders only on reducer changes)
  ├─ status / note boxes / actions
  ├─ <PitchGraph store={graph} />             per-frame
  └─ <NoteRevealOverlay name={revealedName} /> role="status", card only during 'reveal'
```

## Implementation details

- `src/training/pitchGraphStore.ts` (new): closure over `snapshot` and a `Set` of `{ onChange }` entries (one per
  `subscribe` call, so the same callback subscribed twice is two subscriptions and each unsubscribe is idempotent).
  Listeners are iterated over a copy, so unsubscribing during a notification is safe.
- `src/training/useTrainingSession.ts`: per-session store via `useState(() => createPitchGraphStore())`; refs for the
  graph model and progress; `publishGraph` reads `stateRef` (synchronous mirror), so the accepting frame publishes
  `green` and the wrong-note frame `red` even before React commits. The frame handler keeps reading the frame
  synchronously and never retains it. New return fields `graph` and `revealedName` (`selectRevealedName`).
- `src/components/PitchGraph.tsx` (new): pure mapping view → SVG; band geometry from `PITCH_GRAPH_BAND_HALF_HEIGHT`
  (y 50, height 100), fill uses the same y/height, guides from `PITCH_GRAPH_GUIDE_LEVELS`; every coordinate is rounded
  to 2 decimals (`round2`). `store.subscribe` / `store.getSnapshot` are `this`-free closures, so passing them directly
  to `useSyncExternalStore` is safe and stable.
- `src/components/NoteRevealOverlay.tsx` (new): markup exactly as specified; no timer.
- `src/components/TrainingScreen.tsx`: renders `PitchGraph` and `NoteRevealOverlay` after the actions.
- `src/styles.css`: tokens added to `:root` and the dark block; `.pitch-graph*` and `.note-reveal*` rules, keyframes
  `note-reveal-fade` / `note-reveal-pop` (the pop keeps the `translate(-50%, -50%)`), reduced-motion override. The
  graph inherits the column width of `.app` (no new wrapper).
- `e2e/training.spec.ts`: the three tests of the PRD (`locator.waitFor` for the overlay).

## Tests

Unit/component suite: **1474 tests in 33 files** (was 1432 in 30).

- `src/training/pitchGraphStore.test.ts` (new, 7): default / given initial snapshot, publish + notify all, equal view →
  no notify + same reference, stable `getSnapshot`, idempotent unsubscribe, same callback twice.
- `src/components/PitchGraph.test.tsx` (new, 11): svg attributes (aria-hidden, focusable, viewBox, no text), idle band
  geometry, 6 guides at y 175/150/125/75/50/25 + centre at 100, fill rect only when filling (width 128 for 0.4),
  polylines with mapped 2-decimal points, dot cx 256 / cy 140 / r, green/red/idle classes, updates on `publish`,
  unsubscribes on unmount.
- `src/components/NoteRevealOverlay.test.tsx` (new, 3): empty region, card + aria-hidden backdrop, same region element
  across show/hide.
- `src/training/useTrainingSession.test.tsx` (+8): stable `graph`, empty view outside listening, dot/fill/null frame,
  `revealedName` only during reveal, `green` on the matching frame and `idle` after `reveal()` with no frame (sync
  effect; verified the test fails when the effect is removed), `red` on the completing wrong frame, red through
  silence/Repeat, render count over 30+ graph frames unchanged.
- `src/components/App.test.tsx` (+13): graph in every phase below the buttons; idle before pitch; no dot with a tone
  during playing/guard; dot cx 256 / cy 80 at +10 c, nothing right of 80 %, removed by a null frame; filling 153.6
  after 240 ms and reset by a null frame or leaving the band; overlay `Si4` + status + buttons, still at
  `NOTE_REVEAL_MS − margin`, gone at `NOTE_REVEAL_MS` with `idle`; tone during reveal → no dot, still green; wrong note
  (semitone, octave) red with nothing else changing; red through null frames and Repeat → guard → listening, filling
  again after the correct note; Give up during the overlay; last note overlay `Fa#4` + Well done! + Home timing;
  trail present at `PITCH_TRAIL_MS − 200` ms of silence and gone at `+ FRAME_MS`.
- e2e: 11/11 pass (3 in `training.spec.ts`, 2 of them updated, 1 new).
- Not tested in jsdom (CSS not applied): blur, colours, reduced motion, pointer-through (covered by e2e test 3) — see
  the manual checklist in `validation.md`.

## Documentation updates

- `CLAUDE.md`: intro (graph, fill, green/red, overlay, smoothed pitch), status "both parts implemented", architecture
  map (`pitchGraphStore.ts`, `PitchGraph.tsx`, `NoteRevealOverlay.tsx`, hook graph wiring, `TrainingScreen`, e2e),
  "Judging pitch" (smoothed pitch drives acceptance and graph), new conventions (per-frame UI through the store,
  decorative graph, colour tokens, `pointer-events: none`, e2e `waitFor`).
- `README.md`: "How it works" step 4 describes the graph, the green card and the red band.
- `specs/pitch-feedback-graph/create-environment.sh`: header + three extra e2e URLs (red at once, Give up during the
  card, spelling on the card).
- `specs/pitch-feedback-graph/validation.md`: "Human Validation — prd2.md" (34 steps).

## Performance

- Frames outside `listening` still skip level and detection; they only advance the model (O(readings) ≈ 50) and
  compute the view. `publish` skips equal views, so silent periods with no trail and repeated identical frames cause
  no React work at all.
- `TrainingScreen` and the hook re-render only on reducer changes (render-count test over listening frames).

## Known issues

- ~~`npm run lint` reported `no-undef` errors in `validation-run-1/validate.mjs`~~: resolved (the script has the
  `/* global … */` header); `npm run lint` is clean, including `validation-run-2/`.
- The graph height in Chromium at 320 px is 180.75 px (288 px content + 1 px borders, `height: auto`), not exactly
  180; no visual impact.

---

# Fixes

## Dot drawn under the reveal card for one frame (/t-fix, after validation Run 2, P2-10)

- **Symptom:** when the reveal card appeared, the dot of the accepting frame stayed drawn (centred, cy 100) for
  14–17 ms, until the next mic frame (a `null` reading outside `listening`) removed it. prd2 scenario 4 says the dot is
  gone when the overlay appears.
- **Root cause:** the accepting frame advances the graph with its (valid) reading after `noteMatched`, so `hasPitch` is
  true, and `computePitchGraphView` drew the dot from `hasPitch` alone, ignoring `revealing`.
- **Fix:** `src/training/pitchGraph.ts`: `dot` is `null` while `status.revealing` (trail unchanged); `PitchGraphView.dot`
  doc comment updated. The hook is unchanged.
- **PRD:** `prd.md` "Dot" rule gets an Addendum (`revealing` → `null`) with its acceptance criterion.
- **Tests:** `pitchGraph.test.ts` "revealing hides the dot even with pitch; the trail is unchanged";
  `App.test.tsx` "correct note: green band + overlay…" now asserts no `pitch-graph-dot` right after the accepting
  hold. Suite: 1475 tests in 33 files pass; lint and typecheck clean.
- **App check:** validation-run-2 steps P2-4 and P2-5 to P2-13 re-run against the dev server: all pass, leftover dot
  0 ms on all five cards (was 14–17 ms).
- Also removed two unused constants and three redundant `/* global */` names from `validation-run-2/validate.mjs`
  (lint errors).

## Tech debt reduction after /t-review #1 (`review.md`)

The review found 0 critical issues, 0 warnings and 9 suggestions. 8 are fixed; 1 is deferred. No behaviour changed,
so no new tests were needed; the existing tests cover every change.

- `src/training/useTrainingSession.test.tsx`: removed a duplicated `matchedCount` assertion.
- `src/test/sessionDriver.ts`: new exported `detune(hz, cents)`, based on `CENTS_PER_OCTAVE`. It replaces the local
  copies in `App.test.tsx` and `useTrainingSession.test.tsx`.
- `e2e/training.spec.ts`: the card text and the Give up hit test are now each waited for and checked in one
  `page.waitForFunction`. The CLAUDE.md convention "E2E and the 500 ms overlay" is updated to match.
- `src/training/pitchGraph.ts`: `advancePitchGraph` prunes the old readings, then copies once (`slice`) and pushes. A
  gap marker is pushed only onto a non-empty trail, which is the same as the old "drop leading markers" rule. Output is
  identical, and the input's array is never shared.
- `src/components/PitchGraph.tsx`: guide y positions are precomputed at module level (`GUIDE_YS`).
- `src/styles.css`: removed the `--idle` and `--filling` band rules, which repeated the base `.pitch-graph__band`
  fill.
- `src/components/TrainingScreen.tsx`: a `yourTurn(state)` helper builds the status for both `listening` and
  `reveal`. A `switch` fallthrough isn't possible because of `noFallthroughCasesInSwitch`.
- `CLAUDE.md`: re-wrapped the long lines this feature added to 100 characters or fewer. The sessionDriver map entry
  now lists `detune`.
- Deferred: `bump.txt` and the `## [Unreleased]` CHANGELOG entries belong to `/t-prepare-pr`.
- Verification: `npm test` (1475 tests in 33 files), lint and typecheck are clean. `e2e/training.spec.ts` passes 3/3,
  run against the e2e-mode server on 5174.
- `validation.md`: added Appendix A (steps 35–43) for the next `/t-validate` run.
