## What

Live pitch feedback for training (spec: `specs/pitch-feedback-graph/`, idea + `prd.md` + `prd2.md`):

- **Pitch graph** below Repeat melody / Give up. It shows the cents from the closest note (never its name), a 1 s
  trail and a leading dot at 80 % of the width. The tolerance band fills while a note is held in tune, then turns
  **green** on the expected note or **red** on another one. Octave errors count as wrong. Red marks stay through
  Repeat until the right note is played.
- **Reveal overlay**: on a correct note, a large card shows the note's name (spelled as in its box) for 1 s over a
  dimmed, blurred screen. Both layers use `pointer-events: none`, so Give up stays clickable.
- **Judging changes**: pitch is smoothed (time-based EMA, τ = 50 ms) before it is judged. A hold tracker that follows
  the nearest semitone replaces the sustain tracker. A new `reveal` phase (1 s) follows each correct note, and
  Repeat is disabled during it. The tolerance is tightened from ±25 c to ±12.5 c.

## Why

Players had no feedback while playing beyond green boxes. Now they see their intonation live and learn which note
they played without seeing its name, and wrong notes are visible without being announced.

## How (architecture)

- Pure, unit-tested core: `pitchSmoother`, `holdTracker`, and `pitchGraph` (model + view). The reducer adds the
  `reveal` phase and `wrongNotes`.
- `useTrainingSession` keeps one mic subscription per session and dispatches through `dispatchNow` (a synchronous
  reducer mirror).
- Per-frame UI goes through `PitchGraphStore` + `useSyncExternalStore`: mic frames re-render only `PitchGraph`, never
  the hook or the screen.
- Colours are theme tokens (`--color-graph-*`, `--color-reveal-*`) with dark overrides, and reduced motion turns the
  animations off.

## Reviewer notes

- Deviation: one test-table row in the PRD ("silence ages out") is one frame off from the pruning rule; the code
  follows the rule. See `implementation-notes.md`.
- Fix after validation: the dot of the accepting frame was drawn under the card for one frame. The view now hides the
  dot while revealing (prd.md Addendum).
- Code review (`review.md`): 0 critical, 0 warnings, 9 suggestions. 8 are fixed; the 9th (bump.txt + changelog) is
  in this PR.
- Release: `bump.txt` = `minor` (0.3.0 → 0.4.0 on merge); entries are under `## [Unreleased]` in `CHANGELOG.md`.

## Testing

- `npm test`: 1475 tests in 33 files pass; `npm run lint` and `npm run typecheck` are clean.
- e2e (`e2e/training.spec.ts`): 3/3 pass.
- Automated validation run 2 (`validation-assets/validation-report-run-2.md`, Chromium with a synthetic sine
  microphone): 58/60 pass. The 2 skips need a real phone (iOS Safari / Android Chrome) and a screen reader. The
  screenshots and output files it links to are not committed. Nothing has been tested with a real trumpet yet.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
