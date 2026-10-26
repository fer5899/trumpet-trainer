# Code Review: Pitch feedback graph

## Summary
**Pass with notes.** Parts 1 and 2 meet every requirement in prd.md and prd2.md, including the Dot Addendum, and follow the CLAUDE.md conventions. `npm run lint` and `npm run typecheck` are clean, and Vitest passes (1475 tests in 33 files). I found no critical issues and no warnings. The remaining items are small: test hygiene, a possible e2e timing risk, CSS/doc tidiness and a micro-optimisation.

## PRD Compliance
| Requirement | Source | Status | Notes |
|---|---|---|---|
| 1. Constants (`CENTS_PER_SEMITONE`, `NOTE_REVEAL_MS`, `PITCH_SMOOTHING_MS`, `PITCH_TRAIL_MS`, `PITCH_GRAPH_*`) with doc comments + test rows | prd.md §Constants | OK | `src/config/constants.ts:18-19,26-27,68-84`; 10 rows in `constants.test.ts`. |
| 2. `hzToMidi` / `nearestMidi` (ties up) / `centsOffset` | prd.md §2 | OK | `src/music/notes.ts:35-48`; table + `[−50, +50)` sweep tested. |
| 3. Pitch smoother (time-based EMA, reset on null, Δt ≤ 0 keeps value) | prd.md §3 | OK | `src/audio/pitchSmoother.ts:19-42`; every table row tested. |
| 4. Hold tracker replaces sustain tracker (nearest semitone, wrong notes never fill, once per run) | prd.md §4 | OK | `src/training/holdTracker.ts`; `sustainTracker.*` deleted. Only the constant `SUSTAIN_MS` remains in use; no imports of the deleted files are left. |
| 5. Graph model + view (pruning, gap markers, centre persistence, clipping, Fa/Mi/Fa, band precedence, `viewsEqual`) | prd.md §5 | OK | One documented deviation: the "silence ages out" row is off by one frame (t 1180 instead of 1200), and the code follows the explicit pruning rule (implementation-notes, Initial considerations). Intentional. |
| 5. Addendum: no dot while `revealing` | prd.md §5 Addendum | OK | `src/training/pitchGraph.ts:190-192`; covered by unit and App tests. |
| 6. Reducer: `reveal` phase, `wrongNotes`, `wrongNoteHeld`, `revealElapsed`, 24 ignored pairs, new selectors, `selectCanAct` removed | prd.md §6 | OK | `src/training/trainingReducer.ts:44-91`; nothing references `selectCanAct` or `canAct` any more. |
| 7.1 Hook: `dispatchNow` + `stateRef`, one mic subscription, reveal timer, `canRepeat` / `canGiveUp` | prd.md §7.1 | OK | `src/training/useTrainingSession.ts:83-97,186-222`. |
| 7.2 `TrainingScreen` reveal status + button flags | prd.md §7.2 | OK | `src/components/TrainingScreen.tsx:19-35,64-69`. |
| 7.3 `sessionDriver` `reveal()` / `matchNote()` | prd.md §7.3 | OK | `src/test/sessionDriver.ts:54-76`. |
| Part 1 hook/App test updates (listener count 1, smoothing cases, render count) | prd.md Testing Decisions | OK | All listed cases are present. |
| 8. `PitchGraphStore` (no React, equality skip, idempotent unsubscribe) | prd2.md §8 | OK | `src/training/pitchGraphStore.ts`. |
| 9. Hook graph wiring (`graph`, `revealedName`, `publishGraph` after dispatch, sync effect, `progressRef` reset) | prd2.md §9 | OK | `useTrainingSession.ts:73-109,196-228`. |
| 10. `PitchGraph` SVG (`useSyncExternalStore`, geometry, test ids, 2-decimal rounding, no text) | prd2.md §10 | OK | `src/components/PitchGraph.tsx`. |
| 11. `NoteRevealOverlay` (always-mounted `role="status"`, `aria-hidden` backdrop, no timer) | prd2.md §11 | OK | `src/components/NoteRevealOverlay.tsx`. |
| 12. `TrainingScreen` layout (graph always rendered below the actions, overlay) | prd2.md §12 | OK | No new UI strings. |
| 13. CSS tokens (13 light + 13 dark), graph and overlay rules, `pointer-events: none`, reduced motion | prd2.md §13 | OK | `src/styles.css:9-22,35-47,290-404`; no hard-coded colours in the new rules. |
| E2E (matching melody with overlay, red kept through Repeat, Give up through the overlay) | prd2.md §E2E | OK | `e2e/training.spec.ts`. Possible timing risk in Suggestions. |
| Part 2 component/hook/App tests | prd2.md Testing Decisions | OK | All listed cases are present. |
| CLAUDE.md / README updates | prd2.md §CLAUDE.md Updates | OK | Content is accurate against the code. Formatting nit in Suggestions. |

## TODO: Critical Issues (must fix)
None

## TODO: Warnings (should fix)
None

## TODO: Suggestions (nice to have)
- [x] **[src/training/useTrainingSession.test.tsx:501-503]** — The test "a jump from the semitone above is accepted at the 4th target frame + SUSTAIN_MS" asserts `expect(result.current.state.matchedCount).toBe(0)` twice (lines 501 and 503), with the `wrongNotes` check in between. Fix: delete the duplicate on line 503.
- [x] **[src/components/App.test.tsx:655, src/training/useTrainingSession.test.tsx:68]** — The helper `detune = (hz, cents) => hz * 2 ** (cents / 1200)` is defined twice and hard-codes 1200 instead of `CENTS_PER_OCTAVE`. Fix: export one `detune(hz, cents)` from `src/test/sessionDriver.ts`, next to `concertHz`, using `CENTS_PER_OCTAVE`. Import it in both test files.
- [x] **[e2e/training.spec.ts:20-21, 56-62]** — The overlay lives 500 ms, but each check is a separate Playwright round trip after `waitFor({ state: 'visible' })`: line 21 (`toHaveText('Si4')`) and the `evaluate` at lines 56-60. On a slow CI runner the card could be gone before the check runs, so these tests could become flaky. Fix: run the waiting and checking in the page in one step. For test 3, use `page.waitForFunction` that returns `[elementFromPoint(centre) === button, card !== null]` as soon as the card exists. For test 1, check the text in the same `waitForFunction`, e.g. `document.querySelector('[data-testid="note-reveal"]')?.textContent === 'Si4'`, instead of `expect(...).toHaveText`.
- [x] **[src/training/pitchGraph.ts:96,106]** — `advancePitchGraph` copies the readings twice on every mic frame (`[...model.readings]`, then `readings.slice(first)`), in every phase. Fix: compute `first` on `model.readings` first, then build the result once with `model.readings.slice(first)` plus the new reading or gap marker. Behaviour stays the same and existing tests cover it. Optional: the PRD calls the cost negligible.
- [x] **[src/components/PitchGraph.tsx:60-63]** — The 6 guide lines and the centre line never change, but `toY(level)` is recomputed and the `<line>` elements are recreated on every per-frame render. Fix: precompute `const GUIDE_YS = PITCH_GRAPH_GUIDE_LEVELS.map(toY)` at module level, next to `BAND_Y` and `BAND_HEIGHT`, and map over it. Alternatively, hoist the static guides and centre line into a module-level JSX constant.
- [x] **[src/styles.css:303-305]** — The selectors `.pitch-graph__band--idle` and `.pitch-graph__band--filling` are redundant: the same element always has the base class `.pitch-graph__band`, which already sets `fill: var(--color-graph-band)`. Fix: keep only `.pitch-graph__band { fill: var(--color-graph-band); }`, followed by the `--green` and `--red` overrides.
- [x] **[src/components/TrainingScreen.tsx:26,31]** — `statusText` builds the same template ``Your turn: play note ${matchedCount + 1} of ${melody.length}`` in two places (`listening` and `reveal`). Fix: in `case 'reveal'`, return `'Well done!'` when `matchedCount === melody.length`, otherwise fall through (with a `// falls through` comment) to `case 'listening'`. Or move the template into a small `yourTurn(state)` helper.
- [x] **[CLAUDE.md:8,70,91,154,160]** — Several added lines run to 105-130 characters, while the rest of the file wraps at about 100 (for example, the intro line 8 ends with "A Settings panel (gear, top right on every screen) configures the"). Fix: re-wrap these lines to the file's width. Content does not change.
- [ ] **[bump.txt, CHANGELOG.md:7]** — There is no `bump.txt`, and `## [Unreleased]` in `CHANGELOG.md` is empty. The `release-metadata` CI job will fail on the PR until both exist (CLAUDE.md, Versioning). Fix: before opening the PR, run `/t-prepare-pr`, which adds `bump.txt` (`minor`: new user-facing feature) and the Unreleased changelog entries. `version.txt` is already correctly set to `0.3.0-SNAPSHOT-pitch-feedback-graph`. _(Deferred to /t-prepare-pr.)_

## Technical Debt Assessment
**Overall: about neutral, slightly lower.** The feature adds a fair amount of code, but almost all of it is pure, clock-injected and table-tested.

**Debt reduced:**
- The sustain tracker and its per-note mic subscription are gone. There is now one subscription per session, and the nearest-semitone hold tracker has no target and no threshold.
- `selectCanAct` is split into two explicit selectors.
- The reducer transition table covers all 30 phase/action pairs.

**New design is sound:**
- `dispatchNow` + `stateRef` removes a whole class of "frames before commit" races, and tests pin it down: a match can't fire twice, and frames during the reveal are ignored.
- Per-frame UI is isolated through `PitchGraphStore` + `useSyncExternalStore`, and the render-count tests prove the hook doesn't re-render per frame.
- Growth is bounded: readings are pruned to `PITCH_TRAIL_MS` (about 50 entries); `wrongNotes` has no duplicates, is limited to the notes in range and is cleared on every match.
- `viewsEqual` exits on the first difference, so steady silence costs no React work.

**Debt introduced (minor):**
- Two test-helper duplicates (`detune`).
- One redundant test assertion.
- Small CSS selector redundancy.
- `centsFrom` in `notes.ts` is now used only by `pitchDetector.test.ts`. The PRD keeps it on purpose (prd.md §2), but it is dead in production code.

**Checks:**
- No `any`, no `dangerouslySetInnerHTML`, no new dependencies.
- The `?melody=` parsing (`src/testing/testMelody.ts`) is unchanged.
- Public functions have explicit return types.

## Files Reviewed
**Docs and config:**
- `CLAUDE.md`: intro, specs list, architecture map and four new conventions are accurate against the code (`holdTracker`, `pitchSmoother`, `pitchGraph`, `pitchGraphStore`, `PitchGraph`, `NoteRevealOverlay`, hook, reducer, `sessionDriver`, e2e). Some lines are over-long (Suggestion).
- `README.md`: "How it works" step 4 describes smoothing, graph, fill, green card, red band and the ignored mic during reveal. Accurate.
- `version.txt`: snapshot version as the convention requires.

**Constants and music helpers:**
- `src/config/constants.ts`, `src/config/constants.test.ts`: all new constants, documented, in the right groups; one test row each.
- `src/music/notes.ts`, `src/music/notes.test.ts`: helpers match the PRD table, tie behaviour included. `nearestMidi` returns `number`, the same as `ConcertMidi`.

**Pure core:**
- `src/audio/pitchSmoother.ts`, `src/audio/pitchSmoother.test.ts`: correct α, reset semantics and backwards-time handling; frame-rate independence tested.
- `src/training/holdTracker.ts`, `src/training/holdTracker.test.ts`: matches the per-frame rule exactly; all ported and new cases present.
- `src/training/sustainTracker.ts`, `src/training/sustainTracker.test.ts`: deleted. Only the constant `SUSTAIN_MS` is still referenced (expected).
- `src/training/pitchGraph.ts`, `src/training/pitchGraph.test.ts`:
  - Clipping joins pieces by object identity; this is correct because crossing points are always fresh objects.
  - Guide levels are derived from constants; the dot is hidden while revealing; the band follows the precedence rules.
  - 38+ table cases, Fa/Mi/Fa included. Double array copy per frame (Suggestion).
- `src/training/pitchGraphStore.ts`, `src/training/pitchGraphStore.test.ts`: minimal, no React; notifies over a copy of the listener set; unsubscribe is idempotent per subscription.
- `src/training/trainingReducer.ts`, `src/training/trainingReducer.test.ts`: transition table as specified; the expected note is never red; 24 ignored pairs return the same reference; all selectors tested per phase.

**Hook:**
- `src/training/useTrainingSession.ts`:
  - All dispatches go through `dispatchNow`. There is one mic subscription, and the frame is read synchronously.
  - The detector runs only while listening and above the threshold; the graph advances after the dispatch.
  - The sync effect is keyed on `[phase, wrongNotes]`; the reveal timer is cleaned up.
  - StrictMode handling is unchanged: deferred release, stop only if still running.
  - Audio is reached only through `useAudioServices`, and the written → concert conversion happens only at the playback boundary.
- `src/training/useTrainingSession.test.tsx`: thorough; covers reveal timing with `TIMER_DRIFT_MARGIN_MS`, wrong notes, smoothing, render counts and graph snapshots. Duplicate assertion at lines 501/503 (Suggestion).

**Components:**
- `src/components/PitchGraph.tsx`, `src/components/PitchGraph.test.tsx`: pure view → SVG with stable `subscribe`/`getSnapshot` closures; `aria-hidden`, no text. Static guides are recomputed per frame (Suggestion).
- `src/components/NoteRevealOverlay.tsx`, `src/components/NoteRevealOverlay.test.tsx`: always-mounted `role="status"` region, `aria-hidden` backdrop, no timer. Matches the spec exactly.
- `src/components/TrainingScreen.tsx`: graph and overlay are always rendered; status advances in reveal; buttons use the new flags. Duplicated status template (Suggestion).
- `src/components/App.test.tsx`: Part 1 loop and Repeat updates, plus 13 graph/overlay integration tests (every phase, dot/fill geometry, green/red, persistence through Repeat, Give up during the overlay, last note, trail ageing). Duplicated `detune` helper (Suggestion).

**Styles, test helpers, e2e and scripts:**
- `src/styles.css`:
  - Tokens are defined in `:root` with dark overrides; `vector-effect: non-scaling-stroke`.
  - Overlay layers are fixed with z-index 10/11 and `pointer-events: none`, and use the `-webkit-backdrop-filter` prefix.
  - The reduced-motion override is present.
  - No ancestor uses transform or filter, so `position: fixed` works. Redundant band selectors (Suggestion).
- `src/test/sessionDriver.ts`: `hold` extracted and reused by `matchNote`; `reveal()` uses `NOTE_REVEAL_MS`.
- `e2e/training.spec.ts`: the three PRD scenarios, using `locator.waitFor` as the convention requires. Possible timing risk within the 500 ms window (Suggestion).
- `specs/pitch-feedback-graph/create-environment.sh`:
  - POSIX `sh` with `set -eu`, checks that ports are free, and cleans up on `trap`.
  - Its URLs and the note about tones (466.16 Hz = concert B♭4 = written Do5) are correct. Not part of CI.

## Verification

Run on 2026-10-26 against the working tree reviewed above.

| Command | Result |
|---|---|
| `npm test` | Pass: 1475 tests in 33 files |
| `npm run lint` | Pass: no problems |
| `npm run typecheck` | Pass: no errors |

Also: validation Run 2 (`validation-assets/validation-report-run-2.md`) passed 58 of 60 checks, with 2 manual-only
skips. After the reveal-dot fix, steps P2-4 to P2-13 were re-run and all pass.
