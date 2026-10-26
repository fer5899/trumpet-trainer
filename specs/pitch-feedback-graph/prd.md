# Pitch Feedback Graph - Product Requirements Document (Part 1 of 2)

> **Source of truth for product behavior:** `specs/pitch-feedback-graph/idea.md` (referred to as "the idea", sections as §N) and the mockups in `specs/pitch-feedback-graph/mockups/`. One deliberate deviation from the idea (pitch smoothing also drives note acceptance) was requested by the user; see Implementation Decisions.
> **This PRD is split in two files:**
> - `prd.md` (this file): overview, problem, goals, implementation decisions, out of scope, constants, pure core (`hzToMidi` / `nearestMidi` / `centsOffset`, pitch smoother, hold tracker replacing the sustain tracker, pitch graph model + view), reducer changes and selectors, and the **minimal** hook / `TrainingScreen` changes that keep the app working with them. Acceptance criteria and tests for these parts.
> - `prd2.md`: graph store + hook wiring for the graph, `PitchGraph`, `NoteRevealOverlay`, `TrainingScreen` layout, CSS tokens, UI mockups, component tests, e2e, risks, `CLAUDE.md` updates.
>
> **Brownfield note:** paths marked **(new)** do not exist yet; **(deleted)** must be removed; every other path exists and is modified.
> **After Part 1** the app compiles, all tests pass, and the new rules are live: smoothed pitch, any held note produces a result, a 500 ms `reveal` pause after each correct note (box green, status advanced, Give up enabled). There is no graph and no overlay yet (Part 2).

## Overview

A live **pitch graph** below the Training buttons shows how many cents the player is from the **closest** note (never which note), fills the tolerance band while a note is held in tune, and turns it **green** (expected note) or **red** (another note). A correct note is then revealed for a moment in a large green card. Red notes are remembered for the current melody note so the player learns "not that one".

## Problem Statement

Feedback today is binary: the active box turns green once the expected note is held within ±`TOLERANCE_CENTS` for `SUSTAIN_MS`. A player who is slightly sharp/flat or holds the wrong note gets no hint, so they cannot correct intonation or rule out a wrong guess, and they never see a held wrong note acknowledged. The graph and the right/wrong result give that feedback while keeping the ear-training task (which note is it?) hidden.

## Goals

- While listening, every frame with a valid pitch moves the dot within one animation frame; with no valid pitch the dot is hidden and the trail is gone after `PITCH_TRAIL_MS` (1000 ms).
- Holding **any** note within ±25 c for 500 ms produces exactly one result: the expected note → accepted + revealed for `NOTE_REVEAL_MS` (500 ms); another note (including octave errors) → red for the rest of the current melody note, across Repeat.
- Note acceptance timing for a steady tone is unchanged (first in-tune frame + `SUSTAIN_MS`), so every existing timing test keeps passing apart from the added reveal pause.
- Only the graph re-renders per microphone frame; `App`, `TrainingScreen` and the note boxes do not.
- Graph usable at 320 px viewport width; colours readable in light and dark themes.
- No regression: all existing unit, component and e2e tests pass after the documented updates.

## Target Users

- Trumpet players training their ear: they see whether they are in tune and whether a held note was wrong, without being told the answer.
- Beginners with unsteady tone: smoothing keeps short wobbles from resetting the hold.

## Feature Map

| # | Feature area | Defined in |
|---|---|---|
| 1 | Constants | prd.md |
| 2 | Note helpers: `hzToMidi`, `nearestMidi`, `centsOffset` | prd.md |
| 3 | Pitch smoother `src/audio/pitchSmoother.ts` | prd.md |
| 4 | Hold tracker `src/training/holdTracker.ts` (replaces `sustainTracker.ts`) | prd.md |
| 5 | Pitch graph model + view `src/training/pitchGraph.ts` | prd.md |
| 6 | Reducer: `reveal` phase, `wrongNotes`, new actions and selectors | prd.md |
| 7 | Minimal hook + `TrainingScreen` changes (single mic subscription, smoothing, right/wrong, reveal timer, status, buttons) | prd.md |
| 8 | Graph store, hook graph wiring, `PitchGraph`, `NoteRevealOverlay`, layout, CSS tokens, mockups | prd2.md |
| 9 | Component tests, e2e, `CLAUDE.md` | prd2.md |

## Implementation Decisions

- **Everything that decides is pure and clock-injected.** Smoothing, the hold rule, the trail, the clipping and the band state are pure functions of explicit timestamps and readings, so every rule (including the Fa/Mi/Fa wrap-around example of idea §4.3) is a table test. The hook only wires frames to them; the graph component only draws a precomputed view.
- **Smoothing deliberately changes idea §8.** The idea says "no change to how the expected note is matched". At the user's request a short time-based exponential moving average on log pitch (time constant 50 ms) is applied, and the **smoothed** pitch drives everything: trail, dot, graph centre note, band fill, red marks **and** note acceptance. Tolerance (±25 c), sustain time (500 ms) and the threshold are unchanged. Effects: a one-frame wobble outside the band (e.g. +35 c) is pulled back inside and no longer resets the hold; a note started after silence is accepted at exactly the same time as before because the smoother restarts at the first reading after any gap and uses it unchanged; a slide or jump from a neighbouring note into the target is accepted about 1–2 time constants (≈ 60–80 ms) later, because the smoothed value needs that long to enter the band. One signal for display and judgement means the band never contradicts the result. The idea document is not edited; this PRD records the change.
- **The smoothing is time-based, not per-frame.** The weight of a new reading depends on the time since the previous one, so the behaviour is the same at 30, 60 or 120 frames per second and in tests with 20 ms frames.
- **Hold is judged on the nearest semitone, not on the target.** Any note can now produce a result, so the tracker follows whichever semitone is closest to the pitch. Accepting the expected note is equivalent to the old rule: being within ±25 c of the target implies the target is the nearest semitone. Who decides right vs wrong is the hook (expected note comparison), keeping the tracker free of melody knowledge.
- **Exact half-semitone ties round up.** A pitch exactly 50 c between two notes belongs to the upper one (JavaScript `Math.round`). The graph range is therefore −50 c inclusive to +50 c exclusive. Ties never matter for acceptance (they are 25 c outside the band).
- **Red notes never fill.** Once a note is wrong for the current melody note there is nothing more to learn from holding it; a red band with no fill is the simplest unambiguous signal. Red marks are part of the reducer state (cleared by a correct note or a new exercise; kept by Repeat), because they change what the user sees and must follow the exercise lifecycle.
- **A separate `reveal` phase.** Ignoring the microphone for 500 ms after a correct note, showing the overlay and keeping the band green are all "the same time window"; a reducer phase gives it a single source of truth, a timer effect like the guard, and an exhaustive transition table. The status line advances immediately and Give up stays usable during the reveal (user choice); Repeat is disabled because replaying during the reveal would race the overlay timer.
- **One microphone subscription for the whole Training screen.** The graph clock is the frame timestamp, so time keeps scrolling in every phase. Outside `listening` frames are treated as "no pitch" without running the pitch detector, which keeps the CPU cost of playback/guard/reveal unchanged and makes "the microphone is ignored" literally true for acceptance.
- **Synchronous state mirror in the hook.** Several frames can be delivered before React commits a dispatch (always in tests, where frames are emitted inside one `act`). The hook keeps a ref with the latest reducer state, advanced synchronously by running the same pure reducer on every dispatch, so a frame right after a match already sees `reveal` and cannot match twice or fill the next note. The tracker and smoother restart on every phase change for the same reason.
- **The graph view is published to a tiny external store.** The view changes on every frame; putting it in React state of the hook would re-render the Training screen 60 times per second. A store read with `useSyncExternalStore` re-renders only the graph (Part 2).
- **SVG drawn by React, geometry precomputed.** A handful of lines, rectangles and polylines per frame is cheap in SVG, needs no canvas code or dependency, and is inspectable in tests (attributes on elements).
- **Clipping at the edges instead of hiding off-range points.** Readings are drawn relative to the current centre note; a line between an inside and an outside reading is cut where it crosses the top/bottom edge, so the trail "leaves through the edge" and readings of an earlier note reappear when the player returns to it (idea §4.3).
- **The centre note persists through silence.** The band keeps showing the last detected note (and its colour, e.g. red) when the player stops, so a red mark stays visible after Repeat; only before the first reading of the exercise is there no centre (grey band, empty graph).

## Out of Scope

- Everything in idea §8, except the smoothing change above: note names, cents or units on the graph; making `PITCH_TRAIL_MS`, `NOTE_REVEAL_MS`, `TOLERANCE_CENTS`, `SUSTAIN_MS` or `PITCH_SMOOTHING_MS` user settings; the graph on the Home screen ("Test microphone"); scoring, statistics or a history of wrong notes.
- Screen-reader announcement of wrong notes (red is visual only; the graph is `aria-hidden`).
- New runtime dependencies; CI/CD workflow changes; editing `idea.md`.

## Technical Requirements — Constants (`src/config/constants.ts`)

Add under the existing groups (doc comments required):

```ts
// --- Tuning reference --- (existing group)
/** 100 cents per equal-tempered semitone. */
export const CENTS_PER_SEMITONE = CENTS_PER_OCTAVE / SEMITONES_PER_OCTAVE;

// --- Exercise --- (existing group)
/** How long a correct note's name is shown (microphone ignored) before listening resumes. */
export const NOTE_REVEAL_MS = 500;

// --- Pitch detection --- (existing group)
/** Time constant of the exponential smoothing of the detected pitch (log pitch). */
export const PITCH_SMOOTHING_MS = 50;

// --- Pitch feedback graph ---
/** Time span of the trail; it covers 0..PITCH_GRAPH_DOT_X of the graph width (X-axis time scale). */
export const PITCH_TRAIL_MS = 1000;
/** Vertical half-range in cents: top edge = +50 c, bottom edge = −50 c around the centre note. */
export const PITCH_GRAPH_RANGE_CENTS = 50;
/** Horizontal position of the leading dot as a fraction of the graph width. */
export const PITCH_GRAPH_DOT_X = 0.8;
/** Spacing of the dashed guide lines (±12.5, ±25 = band edges, ±37.5 c); 0 c is the solid centre line. */
export const PITCH_GRAPH_GUIDE_CENTS = 12.5;
/** SVG viewBox in user units (8:5); the graph scales uniformly to the column width. */
export const PITCH_GRAPH_VIEWBOX_WIDTH = 320;
export const PITCH_GRAPH_VIEWBOX_HEIGHT = 200;
/** Leading dot radius in viewBox units. */
export const PITCH_GRAPH_DOT_RADIUS = 6;
```

`src/config/constants.test.ts`: add a row per new constant (`CENTS_PER_SEMITONE` 100, `NOTE_REVEAL_MS` 500, `PITCH_SMOOTHING_MS` 50, `PITCH_TRAIL_MS` 1000, `PITCH_GRAPH_RANGE_CENTS` 50, `PITCH_GRAPH_DOT_X` 0.8, `PITCH_GRAPH_GUIDE_CENTS` 12.5, viewBox 320 × 200, dot radius 6). `TOLERANCE_CENTS`, `SUSTAIN_MS` and the threshold constants are unchanged. The viewBox / radius constants are only used in Part 2.

## Core Features — Part 1

### 2. Note helpers — `src/music/notes.ts`

```ts
/** Fractional MIDI number of a frequency (A4 = 440 Hz = 69). Inverse of midiToHz. */
export function hzToMidi(hz: number): number;
/** Closest semitone: Math.round(m). Exact half-semitone ties go up (69.5 → 70, 68.5 → 69). */
export function nearestMidi(m: number): number;
/** Signed cents from m to nearestMidi(m): (m − nearestMidi(m)) × CENTS_PER_SEMITONE, in [−50, +50). */
export function centsOffset(m: number): number;
```

`hzToMidi(hz) = A4_MIDI + SEMITONES_PER_OCTAVE × log2(hz / A4_HZ)`. `centsFrom` and the rest of the module are unchanged (`centsFrom` is still used by `pitchDetector.test.ts`).

| Input | `hzToMidi` | `nearestMidi` | `centsOffset` |
|---|---|---|---|
| 440 Hz | 69 | 69 | 0 |
| 220 Hz | 57 | 57 | 0 |
| 466.164 Hz | 70.000 | 70 | ≈ 0 |
| 443 Hz | 69.1176 | 69 | +11.76 |
| 446.5 Hz | 69.2539 | 69 | +25.39 |
| m = 69.25 | — | 69 | +25 (exact) |
| m = 69.49 | — | 69 | +49 |
| m = 69.5 (440·2^(50/1200) Hz) | — | **70** | **−50** |
| m = 69.51 | — | 70 | −49 |
| m = 68.5 | — | **69** | **−50** |
| m = 68.49 | — | 68 | +49 |

Tests use `toBeCloseTo` for derived values (e.g. `centsOffset(69.2)` ≈ 20).

### 3. Pitch smoother — `src/audio/pitchSmoother.ts` (new, pure, clock-injected)

```ts
export interface PitchSmoother {
  /**
   * Feeds one frame. `midi` = fractional concert MIDI of the raw detected pitch, or null when the
   * frame has no valid pitch (no detection, below threshold, ignored). Returns the smoothed value,
   * or null for a null frame.
   */
  push(timeMs: number, midi: number | null): number | null;
  /** Forgets the previous value: the next reading is returned unchanged. */
  reset(): void;
}
export function createPitchSmoother(timeConstantMs?: number): PitchSmoother; // default PITCH_SMOOTHING_MS
```

Rule:
1. `midi === null` → `reset()`, return `null`.
2. No previous value → `value = midi`, `lastMs = timeMs`, return `midi` (the first reading after a gap is used **unchanged**).
3. Otherwise `dt = max(0, timeMs − lastMs)`, `alpha = 1 − exp(−dt / timeConstantMs)`, `value += alpha × (midi − value)`, `lastMs = timeMs`, return `value`.

Smoothing in MIDI units is smoothing of log frequency (cents are linear in it), so sharp and flat deviations are weighted equally.

| Case (τ = 50 ms) | Expected |
|---|---|
| `push(0, 69)` | 69 |
| `push(0, 69)`, `push(20, 70)` | 69 + (1 − e^−0.4) = **69.3297** |
| α for Δt = 0 / 20 / 50 / 100 / 1000 ms | 0 / 0.3297 / 0.6321 / 0.8647 / ≈ 1 |
| from 69, constant 70 every 10 ms until t = 100 vs every 20 ms until t = 100 | both 70 − e^−2 = **69.8647** (frame-rate independent) |
| constant 69 for 1 s | 69 on every frame |
| `push(0, 69)`, `push(20, null)`, `push(40, 70)` | 69, null, **70** (reset by the gap) |
| `push(100, 69)`, `push(90, 70)` (time went backwards) | 69, 69 (α = 0) |
| `reset()` then `push(t, 70)` | 70 |
| custom `createPitchSmoother(100)`, `push(0,69)`, `push(100,70)` | 69 + (1 − e^−1) = 69.6321 |

### 4. Hold tracker — `src/training/holdTracker.ts` (new, pure, clock-injected; replaces the sustain tracker)

**Delete** `src/training/sustainTracker.ts` and `src/training/sustainTracker.test.ts` (their cases are ported below).

```ts
import type { ConcertMidi } from '../music/notes';

export interface HoldFrame {
  timeMs: number;
  /** Smoothed fractional concert MIDI, or null when the frame has no valid pitch. */
  midi: number | null;
}
export interface HoldStatus {
  /** nearestMidi(midi) of this frame; null without pitch. */
  note: ConcertMidi | null;
  /** 0..1 = min(1, run length / requiredMs); 0 when there is no run. */
  progress: number;
  /** The run's note on the one frame where the run first reaches requiredMs; otherwise null. */
  completed: ConcertMidi | null;
}
export interface HoldTrackerOptions {
  toleranceCents?: number; // default TOLERANCE_CENTS (inclusive: |cents| <= tolerance)
  requiredMs?: number;     // default SUSTAIN_MS
}
export interface HoldTracker {
  push(frame: HoldFrame, wrongNotes: readonly ConcertMidi[]): HoldStatus;
  /** Ends the current run (next qualifying frame starts a new one). */
  reset(): void;
}
export function createHoldTracker(options?: HoldTrackerOptions): HoldTracker;
```

Per frame:
1. `midi === null` → end the run; return `{ note: null, progress: 0, completed: null }`.
2. `note = nearestMidi(midi)`, `cents = centsOffset(midi)`.
3. `|cents| > toleranceCents` **or** `wrongNotes.includes(note)` → end the run; return `{ note, progress: 0, completed: null }`.
4. No run, or the run's note ≠ `note` (wrap to another semitone) → start a run `{ note, startMs: timeMs, done: false }`.
5. `elapsed = timeMs − startMs`; `progress = min(1, elapsed / requiredMs)`.
6. If `elapsed >= requiredMs` and not `done` → `done = true`, `completed = note`; else `completed = null`.

The tracker has no threshold any more: level gating happens before smoothing (the hook passes `null`). There is no target: the hook compares `completed` with the expected note.

Tests (`holdTracker.test.ts`, frames every 20 ms from t = 0, `midi` given directly; ported cases marked ⟲):

| Case | Expected |
|---|---|
| ⟲ midi 69 constant | progress 0 at t 0, 0.48 at t 240, 0.52 at t 260; `completed` null up to t 480, **69 at t 500** |
| ⟲ one frame 69.254 (+25.4 c) at t 260 | progress 0 at 260; run restarts at 280; `completed` 69 at **780** (null at 760) |
| ⟲ one `null` frame at t 260 | `completed` 69 at 780 |
| ⟲ midi 57 / 81 (octaves of 69) | `completed` **57 / 81** at t 500 (any note completes; the hook judges it wrong) |
| ⟲ midi 70 (a semitone off a target 69) | `completed` 70 at 500 |
| ⟲ midi 69.1176 (+11.8 c) | `completed` 69 at 500 |
| ⟲ midi 69.25 (exactly +25 c) | qualifies, `completed` 69 at 500; 69.2501 never fills |
| ⟲ once per run | t 500 → 69, t 520 → null with progress 1; `reset()` at 540 → progress 0 at 540, `completed` 69 at 1040 |
| ⟲ `reset()` ends the run | push t 0, `reset()`, push t 100 … `completed` at 600 |
| ⟲ custom options `{ toleranceCents: 5, requiredMs: 100 }` | 69.118 at t 0 → progress 0; 69 from t 20 → `completed` at **120** |
| nearest note changes (`toleranceCents: 50`) | 69.4 for t 0..400, 69.6 (nearest 70) at 420 → run restarts at 420, `completed` **70** at 920 |
| tie 69.5 | `note` 70, |−50| > 25 → progress 0; with `toleranceCents: 50` → run of 70 |
| wrong notes never fill | `wrongNotes [69]`: midi 69 for 2 s → `note` 69, progress 0, never completes; midi 70 with the same list completes at +500 |
| run broken by becoming wrong | run of 70 to t 300, then pushes with `wrongNotes [70]` → progress 0; with `[]` again → a fresh run from that frame |

### 5. Pitch graph model and view — `src/training/pitchGraph.ts` (new, pure)

```ts
import type { ConcertMidi } from '../music/notes';

/** One frame for the graph: smoothed fractional concert MIDI, or null (no valid pitch / mic ignored). */
export interface PitchReading { timeMs: number; midi: number | null }

export interface PitchGraphModel {
  /** Oldest first; nowMs − timeMs <= trailMs; null entries are gap markers (never first, never two in a row). */
  readonly readings: readonly PitchReading[];
  /** Nearest note of the latest valid reading of the session; null before the first one. */
  readonly centre: ConcertMidi | null;
  /** Time of the newest frame; null before the first frame. */
  readonly nowMs: number | null;
  /** The newest frame had a valid pitch (the dot is shown). */
  readonly hasPitch: boolean;
}
export const EMPTY_PITCH_GRAPH_MODEL: PitchGraphModel; // { readings: [], centre: null, nowMs: null, hasPitch: false }
export function advancePitchGraph(model: PitchGraphModel, frame: PitchReading, trailMs?: number): PitchGraphModel;

export type BandState = 'idle' | 'filling' | 'green' | 'red';
/** x: 0 (left) .. 1 (right) of the width; y: −1 (bottom, −RANGE c) .. +1 (top, +RANGE c). */
export interface GraphPoint { x: number; y: number }
export interface PitchGraphStatus {
  progress: number;                      // HoldStatus.progress of the newest frame (0 outside listening)
  wrongNotes: readonly ConcertMidi[];    // reducer state
  revealing: boolean;                    // phase === 'reveal'
}
export interface PitchGraphView {
  /** Visible trail polylines, oldest first, each with >= 2 points. */
  segments: readonly (readonly GraphPoint[])[];
  /** Leading dot at x = PITCH_GRAPH_DOT_X; null when the newest frame has no pitch. */
  dot: GraphPoint | null;
  bandState: BandState;
  /** Fill width as a fraction of the graph width; > 0 only when bandState is 'filling'. */
  fill: number;
}
export const EMPTY_PITCH_GRAPH_VIEW: PitchGraphView; // { segments: [], dot: null, bandState: 'idle', fill: 0 }
/** Band half-height in y units: TOLERANCE_CENTS / PITCH_GRAPH_RANGE_CENTS (= 0.5). */
export const PITCH_GRAPH_BAND_HALF_HEIGHT: number;
/** Dashed guide levels in y units, excluding 0: multiples of GUIDE/RANGE strictly inside (−1, 1) → [−0.75, −0.5, −0.25, 0.25, 0.5, 0.75]. */
export const PITCH_GRAPH_GUIDE_LEVELS: readonly number[];
export function computePitchGraphView(model: PitchGraphModel, status: PitchGraphStatus, trailMs?: number): PitchGraphView;
/** Structural equality (segments, points, dot, bandState, fill); used to skip identical publishes. */
export function viewsEqual(a: PitchGraphView, b: PitchGraphView): boolean;
```

`trailMs` defaults to `PITCH_TRAIL_MS` everywhere.

**`advancePitchGraph(model, { timeMs, midi })`** returns a new model:
1. `midi !== null` → append `{ timeMs, midi }`; `centre = nearestMidi(midi)`; `hasPitch = true`.
2. `midi === null` → append a gap marker `{ timeMs, midi: null }` only if the last reading exists and is valid; `centre` unchanged (**persists through silence**); `hasPitch = false`.
3. `nowMs = timeMs`; drop readings with `nowMs − r.timeMs > trailMs`; then drop leading gap markers.

**`computePitchGraphView(model, status)`:**
- `nowMs === null` → `EMPTY_PITCH_GRAPH_VIEW` (with `bandState` from the rule below).
- Point of a reading: `x = PITCH_GRAPH_DOT_X × (1 − (nowMs − timeMs) / trailMs)` (newest at 0.8, `trailMs` old at 0), `y = (midi − centre) × CENTS_PER_SEMITONE / PITCH_GRAPH_RANGE_CENTS` (unclipped).
- **Segments:** split the readings at gap markers into runs of consecutive valid readings. For each run, clip every consecutive pair (A, B) to `−1 ≤ y ≤ 1` (inclusive): both inside → keep; one outside → replace the outside end by the crossing point with the edge it is beyond (`t = (edge − yA) / (yB − yA)`, `x = xA + t(xB − xA)`, `y = edge`); both beyond the same edge → drop; beyond opposite edges → keep the piece between the two crossings. Join consecutive kept pieces that share an endpoint into one polyline; a dropped pair splits the polyline. Polylines with fewer than 2 points are omitted (a single isolated reading draws no trail; the dot shows it).
- **Dot:** `hasPitch` → `{ x: PITCH_GRAPH_DOT_X, y }` of the newest reading (always within `[−1, 1)` because the centre is its nearest note); otherwise `null`.
  <!-- Added: fix for the dot of the accepting frame staying drawn for one frame when the reveal card appears -->
  **Addendum:** `revealing` → `null` (even with `hasPitch`), so the accepting frame, which publishes with `revealing`
  already true, never shows the dot under the card (prd2 scenario 4: "the dot is gone"). The trail is unaffected.
  Acceptance: `computePitchGraphView` of a model whose newest reading has pitch, with `revealing: true`, has
  `dot: null` and the same segments as with `revealing: false`; in the app, the frame that completes the hold already
  shows no `pitch-graph-dot`.
- **Band state** (first match wins): `revealing` → `'green'`; `centre === null` → `'idle'`; `wrongNotes.includes(centre)` → `'red'`; `progress > 0` → `'filling'`; else `'idle'`. **Fill** = `progress` when `'filling'`, else 0.

Changing `trailMs` changes only the X scale: the dot stays at 0.8.

Tests (`pitchGraph.test.ts`, explicit timestamps, raw `midi` values):

| Case | Expected |
|---|---|
| no frames | `EMPTY_PITCH_GRAPH_VIEW` |
| only `null` frames from the start | no readings, `centre` null, view idle, no segments, no dot |
| 69 at t 0..1000 every 20 ms | one segment, x from 0 (t 0) to 0.8 (t 1000), all y 0; dot `{0.8, 0}` |
| pruning | after t 1500 with frames since 0: oldest kept reading t ≥ 500 |
| 69.2 (+20 c) | y 0.4; 68.8 → y −0.4; 69.49 → y 0.98 |
| gap | 69 t 0..200, null t 220..400, 69 t 420..600 → 2 segments; the null run stores one marker |
| silence ages out | 69 t 0..200, then null every 20 ms: segments until t 1200 inclusive, none at 1220; dot null from t 220; `centre` still 69 |
| **Fa/Mi/Fa (idea §4.3)** | 65 at t 0..180, 64 at t 200..680, 65 at t 700..900. At now 900: centre 65; segment 1 = t 0..180 at y 0 then the bottom-edge crossing `{x 0.232, y −1}` (t 190); segment 2 starts at `{x 0.632, y −1}` (t 690), then t 700..900 at y 0 ending at `{0.8, 0}`. At now 600 (on Mi): centre 64; one segment from the top-edge crossing `{x 0.472, y 1}` (t 190) through t 200..600 at y 0; the Fa readings are off the graph |
| wrap without a gap | 69.4 → 69.45 → 69.55 (centre becomes 70): the earlier readings are at y −1.2/−1.1 → clipped, the line leaves through the bottom edge |
| opposite edges | 69.75 at t 0, 68.25 at t 20, 69 at t 40 (centre 69): pair (t 0, t 20) keeps only the piece from `y 1` (t ≈ 3.3) to `y −1` (t ≈ 16.7); pair (t 20, t 40) keeps the piece from `y −1` (t ≈ 26.7) to `y 0` (t 40); the two pieces share no endpoint → 2 polylines |
| both beyond one edge | 70 at t 0..100, then 69 from t 120 (centre 69): the 70 readings (y 2) are dropped; one polyline from the crossing `y 1` at t 110 to the newest point |
| centre persistence + band | after 70 is in `wrongNotes`, 70 then null frames for 2 s → `bandState` 'red', no segments, no dot |
| band states | `revealing` → green (even with progress); centre null → idle; centre in wrongNotes → red (progress ignored, fill 0); progress 0.4 → filling, fill 0.4; progress 0 → idle |
| `trailMs` 2000 | the reading at now − 1000 has x 0.4; dot still 0.8 |
| `viewsEqual` | equal for structurally equal views; false when any point, the dot, band state or fill differs |

### 6. Reducer — `src/training/trainingReducer.ts`

```ts
export type TrainingPhase = 'playing' | 'guard' | 'listening' | 'reveal' | 'complete';

export interface TrainingState {
  phase: TrainingPhase;
  melody: Melody;
  names: readonly string[];
  /** 0..melody.length; also the active index while < length. Incremented when the reveal starts. */
  matchedCount: number;
  /** Concert notes (integers) held to completion that are not the current expected note. Insertion order, no duplicates. */
  wrongNotes: readonly ConcertMidi[];
}

export type TrainingAction =
  | { type: 'playbackEnded' }
  | { type: 'guardElapsed' }
  | { type: 'noteMatched' }
  | { type: 'wrongNoteHeld'; midi: ConcertMidi }
  | { type: 'revealElapsed' }
  | { type: 'repeatRequested' };

export function createInitialTrainingState(exercise: Exercise): TrainingState; // + wrongNotes: []
/** writtenToConcert(melody[matchedCount]), or null when every note is matched. */
export function selectExpectedNote(state: TrainingState): ConcertMidi | null;
export function selectCanRepeat(state: TrainingState): boolean;   // phase === 'listening'
export function selectCanGiveUp(state: TrainingState): boolean;   // phase === 'listening' || 'reveal'
/** names[matchedCount − 1] during 'reveal', else null. */
export function selectRevealedName(state: TrainingState): string | null;
export function selectNoteBoxes(state: TrainingState): NoteBoxView[]; // unchanged logic
```

`selectCanAct` is **removed** (replaced by the two selectors). `selectNoteBoxes` is unchanged: during `reveal` the matched box is already `done` (mockup 5) and the next one is `active`; after the last note every box is `done`.

**Transition table** (any pair not listed returns the **same object reference**):

| From | Action | To |
|---|---|---|
| `playing` | `playbackEnded` | `guard` |
| `guard` | `guardElapsed` | `listening` |
| `listening` | `noteMatched` | `reveal`, `matchedCount + 1`, `wrongNotes: []` (also for the last note) |
| `listening` | `wrongNoteHeld { midi }` | `listening`, `wrongNotes: [...wrongNotes, midi]`; **same reference** if `midi` is already in the list or equals `selectExpectedNote(state)` (invariant: the expected note is never red) |
| `listening` | `repeatRequested` | `playing` (`matchedCount` and `wrongNotes` kept) |
| `reveal` | `revealElapsed` | `complete` if `matchedCount === melody.length`, else `listening` |

Ignored pairs: 5 phases × 6 actions = 30 pairs; 6 valid → **24 ignored** (including `wrongNoteHeld`, `repeatRequested` and `noteMatched` during `reveal`, and every action in `complete`). A new exercise creates a new state, so red marks never leak between exercises.

Tests (`trainingReducer.test.ts`, update): add `'reveal'` to `PHASES` and the two new actions to `ACTIONS` (`wrongNoteHeld` with `midi: 70`); `VALID` gets `listening:wrongNoteHeld` and `reveal:revealElapsed`; ignored count **24**; `noteMatched` → `reveal` with `matchedCount + 1` and cleared `wrongNotes`; `revealElapsed` → `listening` (n < length) / `complete` (n = length) with names/melody references kept; `wrongNoteHeld` appends, keeps order, ignores duplicates and the expected note (same reference); `repeatRequested` keeps `wrongNotes`; the "last match completes it" test becomes `noteMatched` + `revealElapsed` per note; `selectCanRepeat` / `selectCanGiveUp` / `selectRevealedName` / `selectExpectedNote` per phase; `selectNoteBoxes` in `reveal` (`matchedCount` 1 → box 0 done with its name, box 1 active; `matchedCount` = length → all done).

### 7. Minimal hook and screen changes (keeps the app working)

#### 7.1 Hook — `src/training/useTrainingSession.ts`

`UseTrainingSessionArgs` is unchanged. `TrainingSessionView` replaces `canAct` with:

```ts
export interface TrainingSessionView {
  state: TrainingState;
  boxes: NoteBoxView[];
  canRepeat: boolean;   // selectCanRepeat
  canGiveUp: boolean;   // selectCanGiveUp
  repeat(): void;       // repeatRequested (no-op unless listening)
  giveUp(): void;       // stops playback, releases the mic, onExit (allowed in any phase; button enabled in listening + reveal)
}
```

Per-session objects (one `useState` each, never recreated): `tracker = createHoldTracker()`, `smoother = createPitchSmoother()`.

**Synchronous state mirror.** `stateRef = useRef(state)` (initial state). Every dispatch goes through

```ts
const dispatchNow = useCallback((action: TrainingAction) => {
  const prev = stateRef.current;
  const next = trainingReducer(prev, action);
  if (next === prev) return;
  stateRef.current = next;
  if (next.phase !== prev.phase) { tracker.reset(); smoother.reset(); }
  dispatch(action);
}, [tracker, smoother]);
```

`dispatch` is never called directly. React state and `stateRef` stay equal because the reducer is pure and sees the same action sequence.

**Effects:**

| # | Effect | Deps | Behaviour |
|---|---|---|---|
| — | live-settings refs, volume, unmount release | as today | unchanged |
| 1 | playing | `[phase, melody, services, dispatchNow]` | as today, minus `tracker.reset()` (phase changes reset it); `playbackEnded` via `dispatchNow` |
| 2 | guard | `[phase, dispatchNow]` | `setTimeout(LISTEN_GUARD_MS)` → `guardElapsed` |
| 3 | **reveal (new)** | `[phase, dispatchNow]` | `phase === 'reveal'` → `setTimeout(NOTE_REVEAL_MS)` → `revealElapsed`; cleanup clears it (unmount / Give up) |
| 4 | **mic frames (replaces the per-note listening effect)** | `[mic, services, thresholdDb, tracker, smoother, dispatchNow]` | **one** `mic.subscribe` for the whole session (all phases); returns the unsubscribe |
| 5 | complete | `[phase, exit]` | unchanged: `COMPLETE_PAUSE_MS` → exit (it now starts after the last reveal) |

**Frame handler** (reads the frame synchronously, never retains it):

```ts
({ timeMs, samples }) => {
  const current = stateRef.current;
  if (current.phase !== 'listening') return;            // mic ignored: no level, no detection (Part 2 feeds the graph a null reading here)
  const levelDb = computeLevelDb(samples);
  const hz = levelDb >= thresholdDb ? (services.detectPitch(samples, mic.sampleRate)?.hz ?? null) : null;
  const midi = smoother.push(timeMs, hz === null ? null : hzToMidi(hz));
  const hold = tracker.push({ timeMs, midi }, current.wrongNotes);
  if (hold.completed !== null) {
    dispatchNow(hold.completed === selectExpectedNote(current)
      ? { type: 'noteMatched' }
      : { type: 'wrongNoteHeld', midi: hold.completed });
  }
}
```

Consequences: a match moves `stateRef` to `reveal` within the same frame, so later frames (even in the same `act`) are ignored and the next note starts with a fresh tracker and smoother after `revealElapsed`. Octave errors are wrong (`completed` is a different MIDI number). StrictMode: the subscription effect unsubscribes and re-subscribes on the simulated remount; the deferred `mic.release()` is unchanged.

#### 7.2 `src/components/TrainingScreen.tsx` (minimal)

- `statusText`: `case 'reveal'` → `matchedCount === melody.length ? 'Well done!' : \`Your turn: play note ${matchedCount + 1} of ${melody.length}\`` (the count is already incremented, so the status advances as soon as the note is accepted). Other texts unchanged: `Listen…`, `Get ready…`, `Your turn: play note N of M`, `Well done!`.
- Repeat melody `disabled={!canRepeat}`; Give up `disabled={!canGiveUp}`.

#### 7.3 Test helper — `src/test/sessionDriver.ts`

Add to `SessionDriver`: `reveal(): Promise<void>` (= `elapse(NOTE_REVEAL_MS)`) and `matchNote(hz: number): Promise<void>` (= `hold(hz, SUSTAIN_MS)` then `reveal()`). `FRAME_MS`, `hold` and the frame clock are unchanged. Note on smoothing: a constant `hold` tone gives a constant smoothed value (the first reading after a gap is unchanged), so held-tone timings stay exact; tests that change the tone between consecutive frames must account for the EMA (see table below).

## Acceptance Criteria — Part 1

**Constants and helpers**
- [ ] All new constants exist with the documented values and doc comments; no new magic numbers.
- [ ] `hzToMidi`, `nearestMidi`, `centsOffset` reproduce every row of the table (ties: 69.5 → 70, 68.5 → 69).

**Smoother**
- [ ] First reading after creation, `reset()` or a `null` frame is returned unchanged; `null` returns `null`.
- [ ] α = 1 − e^(−Δt/τ); results are identical for 10 ms and 20 ms frame spacing; Δt ≤ 0 keeps the value.

**Hold tracker**
- [ ] Every ported sustain-tracker case holds with `midi` input; `sustainTracker.ts` and its test are deleted and nothing imports them.
- [ ] Runs follow the nearest semitone; a run resets on no pitch, |cents| > tolerance, a nearest-note change, or a note in `wrongNotes`; a wrong note's progress is always 0 and it never completes.
- [ ] `completed` fires exactly once per run at `elapsed >= requiredMs`; `progress` = min(1, elapsed / requiredMs).

**Graph model**
- [ ] Readings older than `PITCH_TRAIL_MS` are dropped; gap markers split segments and never lead or repeat.
- [ ] Clipping matches the rules (inclusive edges, crossing points interpolated, dropped pairs split polylines, < 2-point polylines omitted); the Fa/Mi/Fa example yields exactly the documented points at now 900 and now 600.
- [ ] The centre is the nearest note of the latest valid reading and persists through silence; no centre before the first reading.
- [ ] Dot only when the newest frame has pitch, always at x 0.8; band states and fill follow the precedence green > idle(no centre) > red > filling > idle.

**Reducer**
- [ ] The transition table holds; the 24 ignored pairs return the same reference; `wrongNoteHeld` never adds a duplicate or the expected note.
- [ ] `noteMatched` always goes to `reveal` and clears `wrongNotes`; `revealElapsed` goes to `listening` or `complete`; `repeatRequested` keeps `wrongNotes`.
- [ ] `selectCanRepeat` true only in `listening`; `selectCanGiveUp` true in `listening` and `reveal`; `selectRevealedName` is the matched note's name during `reveal` only.

**Hook / screen (Part 1 behaviour)**
- [ ] The training mic session has exactly one listener from mount until release, in every phase; `detectPitch` is never called outside `listening` or below the threshold.
- [ ] A steady correct tone is accepted at first in-tune frame + 500 ms (unchanged); the box turns `done`, the status advances immediately, Repeat is disabled and Give up enabled for `NOTE_REVEAL_MS`, then listening resumes.
- [ ] Frames during `reveal` never fill or match the next note, even when it is the same pitch.
- [ ] Holding another note (or the right note in another octave) in tune for 500 ms adds it to `state.wrongNotes`, does not advance; it is kept after Repeat and cleared after the correct note.
- [ ] After the last note: `reveal` for 500 ms, then `complete` with `COMPLETE_PAUSE_MS` before exit.
- [ ] Give up during `reveal` releases the mic and exits once; no timer fires afterwards.

## Testing Decisions — Part 1

TDD: write each failing test first; co-located `*.test.ts(x)`; table-driven with explicit timestamps.

| File | Status | Covers |
|---|---|---|
| `src/music/notes.test.ts` | update | `hzToMidi`, `nearestMidi`, `centsOffset` table |
| `src/audio/pitchSmoother.test.ts` | new | smoother table |
| `src/training/holdTracker.test.ts` | new | hold tracker table (ported + new) |
| `src/training/sustainTracker.ts`, `.test.ts` | **deleted** | — |
| `src/training/pitchGraph.test.ts` | new | graph model/view table incl. Fa/Mi/Fa |
| `src/training/trainingReducer.test.ts` | update | see §6 |
| `src/config/constants.test.ts` | update | new rows |
| `src/test/sessionDriver.ts` | update | `reveal()`, `matchNote()` |
| `src/training/useTrainingSession.test.tsx` | update | see below |
| `src/components/App.test.tsx` | update | see below |

**`useTrainingSession.test.tsx` changes:**
- `canAct` assertions → `canRepeat` / `canGiveUp` (`canGiveUp` false while playing, true while listening).
- "does not listen during playing or guard": `listenerCount` is **1** from mount (was 0 during playing/guard); the assertions that nothing matches and `detectPitch` is not called stay. Same change at the Repeat test (`listenerCount` 1 after Repeat, was 0) and the complete test (1 while `complete`, 0 after release).
- After every match that is followed by more holds, call `driver.reveal()` (or use `matchNote`); the complete test loops `matchNote` and then checks `reveal` → `complete`.
- New: phase `reveal` right after a match with `canRepeat` false, `canGiveUp` true, box 0 done; `reveal` → `listening` at `NOTE_REVEAL_MS` (not yet at `NOTE_REVEAL_MS − TIMER_DRIFT_MARGIN_MS`); holding the next note's pitch during `reveal` for 2 × `SUSTAIN_MS` does nothing and the next note still needs a full 500 ms after the reveal; last note → `reveal` then `complete`, exit after `COMPLETE_PAUSE_MS` more; Give up during `reveal` → released, `onExit` once, `vi.getTimerCount()` 0 after unmount.
- New: a semitone off for 500 ms → `state.wrongNotes` = [concert of that note], `matchedCount` 0, still `listening`; an octave error is wrong too; kept after `repeat()`; cleared after `matchNote` of the right note.
- New (smoothing): one frame at +35 c (`concertHz(m) × 2^(35/1200)`) in the middle of a correct hold does **not** reset it (accepted at first frame + 500 ms; the raw rule would reset); a jump from the semitone above (held 200 ms) to the target accepts at the 4th target frame + 500 ms (smoothed: +67 c, +45 c, +30 c, then +20 c inside the band), i.e. 60 ms later than the raw rule; a single below-threshold frame still resets the hold (gap → acceptance at that frame + 20 ms + 500 ms, as before).
- New: render counting (`renderHook` callback increments a counter): 20 listening frames without a result cause **no** re-render.

**`App.test.tsx` changes (Part 1):** the "after the 5th match" and "dialog stays open when the exercise completes" loops use `matchNote` (or add `elapse(NOTE_REVEAL_MS)`) per note; the Repeat test waits `reveal()` after the first match before the partial hold and the click; "changes nothing" cases still leave every box unchanged (the band turns red only in Part 2); "Give up" stays enabled during reveal. Graph and overlay assertions are added in Part 2.

**e2e:** no change needed in Part 1; timings: each note adds 500 ms, the 5 × 71 melody now takes ≈ 5 s playback + 0.25 s guard + 5 × 1 s + 1.5 s ≈ 12 s, inside the 30 s test timeout and the 15 s per-box timeout.
