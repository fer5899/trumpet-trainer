# Pitch Feedback Graph - Product Requirements Document (Part 2 of 2)

> Continuation of `specs/pitch-feedback-graph/prd.md` (Part 1), which defines the overview, goals, implementation decisions (including the user-requested smoothing change to idea §8), out of scope, the new constants (`NOTE_REVEAL_MS`, `PITCH_SMOOTHING_MS`, `PITCH_TRAIL_MS`, `PITCH_GRAPH_*`, `CENTS_PER_SEMITONE`), `hzToMidi` / `nearestMidi` / `centsOffset`, the pitch smoother (`createPitchSmoother`), the hold tracker (`createHoldTracker`, replacing the deleted sustain tracker), the graph model and view (`src/training/pitchGraph.ts`: `PitchGraphModel`, `advancePitchGraph`, `PitchGraphView`, `BandState`, `computePitchGraphView`, `PITCH_GRAPH_BAND_HALF_HEIGHT`, `PITCH_GRAPH_GUIDE_LEVELS`, `viewsEqual`), the reducer (`reveal` phase, `wrongNotes`, `wrongNoteHeld`, `revealElapsed`, `selectCanRepeat`, `selectCanGiveUp`, `selectRevealedName`, `selectExpectedNote`) and the Part 1 hook (`dispatchNow` + `stateRef`, one mic subscription per session, reveal timer, `canRepeat` / `canGiveUp`). Read Part 1 first. Behavior source of truth: `specs/pitch-feedback-graph/idea.md` and `mockups/*.png`.
> **Brownfield note:** paths marked **(new)** do not exist yet; every other path exists and is modified. `src/components/App.tsx` is **not** changed.

## Core Features — Part 2

### 8. Graph store — `src/training/pitchGraphStore.ts` (new)

```ts
import type { PitchGraphView } from './pitchGraph';

export interface PitchGraphStore {
  getSnapshot(): PitchGraphView;
  /** Returns an idempotent unsubscribe. */
  subscribe(onChange: () => void): () => void;
  /** Replaces the snapshot and notifies subscribers, unless viewsEqual(current, view) (then nothing happens). */
  publish(view: PitchGraphView): void;
}
export function createPitchGraphStore(initial?: PitchGraphView): PitchGraphStore; // default EMPTY_PITCH_GRAPH_VIEW
```

A plain listener set; `getSnapshot` returns the same object until a non-equal publish (required by `useSyncExternalStore`). No React import.

### 9. Hook graph wiring — `src/training/useTrainingSession.ts`

Additions on top of Part 1 §7.1:

```ts
export interface TrainingSessionView {
  // … Part 1 fields (state, boxes, canRepeat, canGiveUp, repeat, giveUp)
  /** Stable for the whole session; only PitchGraph subscribes to it. */
  graph: PitchGraphStore;
  /** selectRevealedName(state): the matched note's name during 'reveal', else null. */
  revealedName: string | null;
}
```

- Per-session objects: `graph = createPitchGraphStore()` (`useState`), `graphModelRef = useRef(EMPTY_PITCH_GRAPH_MODEL)`, `progressRef = useRef(0)`.
- `publishGraph()` (stable callback): `graph.publish(computePitchGraphView(graphModelRef.current, { progress: progressRef.current, wrongNotes: stateRef.current.wrongNotes, revealing: stateRef.current.phase === 'reveal' }))`.
- `dispatchNow`: on a phase change also sets `progressRef.current = 0` (next to the tracker/smoother reset).
- **Frame handler** (replaces Part 1's early return; still reads the frame synchronously):
  1. `current = stateRef.current`; `midi = null`; `progressRef.current = 0`.
  2. If `current.phase === 'listening'`: level → `hz` → `midi = smoother.push(…)` → `hold = tracker.push(…)` → `progressRef.current = hold.progress` → on `hold.completed` dispatch `noteMatched` / `wrongNoteHeld` exactly as in Part 1.
  3. Every phase: `graphModelRef.current = advancePitchGraph(graphModelRef.current, { timeMs, midi })`, then `publishGraph()`. The view is computed **after** the dispatch, so the matching frame already shows `green` and a completed wrong note already shows `red`.
- **Graph sync effect (new)**, deps `[state.phase, state.wrongNotes, publishGraph]`: `publishGraph()`. Phase / red-mark changes (green → grey after the reveal, reds cleared) show immediately, without waiting for the next frame.
- Frames outside `listening` (playing, guard, reveal, complete) add `null` readings: dot hidden, no trail added, the old trail ages out, the centre and its colour persist. Time scrolls in every phase because every frame advances `nowMs`.

Per-phase summary of the session after Part 2:

| Phase | Mic frames | Detector | Hold tracker / smoother | Graph | Timers |
|---|---|---|---|---|---|
| `playing` | subscribed | not called | not fed (reset on entry) | null readings; band = centre colour (red persists) | — (playback `done` → `playbackEnded`) |
| `guard` | subscribed | not called | not fed | null readings | `LISTEN_GUARD_MS` → `guardElapsed` |
| `listening` | subscribed | if level ≥ threshold | fed every frame | smoothed readings, dot, fill, red | — |
| `reveal` | subscribed | not called | not fed (reset on entry and exit) | null readings, band `green` | `NOTE_REVEAL_MS` → `revealElapsed` |
| `complete` | subscribed until release | not called | not fed | null readings, band from centre (idle) | `COMPLETE_PAUSE_MS` → exit |

### 10. `PitchGraph` — `src/components/PitchGraph.tsx` (new)

```ts
export interface PitchGraphProps { store: PitchGraphStore }
```

`const view = useSyncExternalStore(store.subscribe, store.getSnapshot)`. No other state, no effects, no decisions: it maps the view to SVG. Coordinates: `W = PITCH_GRAPH_VIEWBOX_WIDTH` (320), `H = PITCH_GRAPH_VIEWBOX_HEIGHT` (200), `toX(x) = x × W`, `toY(y) = (1 − y) / 2 × H`. Numbers in `points` / `cx` / `cy` / `width` are rounded to 2 decimals.

```tsx
<svg className="pitch-graph" data-testid="pitch-graph" data-band-state={view.bandState}
     viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
  <rect className={`pitch-graph__band pitch-graph__band--${view.bandState}`} data-testid="pitch-graph-band"
        x="0" y={toY(PITCH_GRAPH_BAND_HALF_HEIGHT)} width={W} height={PITCH_GRAPH_BAND_HALF_HEIGHT * H} />   {/* y 50, height 100 */}
  {view.fill > 0 && <rect className="pitch-graph__fill" data-testid="pitch-graph-fill"
        x="0" y="50" width={view.fill * W} height="100" />}
  {PITCH_GRAPH_GUIDE_LEVELS.map((level) => <line key={level} className="pitch-graph__guide"
        x1="0" x2={W} y1={toY(level)} y2={toY(level)} />)}                                           {/* 6 dashed lines */}
  <line className="pitch-graph__centre" x1="0" x2={W} y1={H / 2} y2={H / 2} />
  {view.segments.map((points, i) => <polyline key={i} className="pitch-graph__trail" data-testid="pitch-graph-trail"
        points={points.map((p) => `${toX(p.x)},${toY(p.y)}`).join(' ')} />)}
  {view.dot && <circle className="pitch-graph__dot" data-testid="pitch-graph-dot"
        cx={toX(view.dot.x)} cy={toY(view.dot.y)} r={PITCH_GRAPH_DOT_RADIUS} />}
</svg>
```

Test hooks: `data-band-state` = `idle | filling | green | red`; `pitch-graph-fill` exists only while filling (its `width` = fill × 320); `pitch-graph-dot` exists only while the newest frame has pitch; one `pitch-graph-trail` per visible segment. The graph has no text, labels, numbers or note names (idea §4.1); the centre note is not exposed in the DOM.

### 11. `NoteRevealOverlay` — `src/components/NoteRevealOverlay.tsx` (new)

```ts
export interface NoteRevealOverlayProps {
  /** The revealed note name exactly as in its note box (state.names[i], e.g. "Fa#3"); null = hidden. */
  name: string | null;
}
```

```tsx
<div className="note-reveal" role="status" data-testid="note-reveal-region">
  {name !== null && (
    <>
      <div className="note-reveal__backdrop" aria-hidden="true" />
      <p className="note-reveal__card" data-testid="note-reveal">{name}</p>
    </>
  )}
</div>
```

- **Live region:** the `role="status"` wrapper (implicit `aria-live="polite"`, `aria-atomic="true"`) is always mounted, so inserting the card announces the name once (e.g. "Fa#3"). Removing it announces nothing. The status line (`aria-live="polite"`) announces the advanced text ("Your turn: play note 2 of 5" / "Well done!") at the same time; the two messages differ, so the name is never announced twice. Wrong notes are never announced.
- **Layering:** backdrop = `position: fixed; inset: 0` dim layer with `backdrop-filter: blur(…)` that blurs and darkens **everything** behind it (training content, gear, page), as in mockup 5; the card is fixed and centred above it. Both have **`pointer-events: none`**, so Give up (and the gear) stay clickable through the dimmed screen. The Settings dialog (top layer) still opens above it.
- **Motion:** a short fade (backdrop) and fade + scale-in (card) via CSS `animation`; durations live in CSS (styling, not tunables). `@media (prefers-reduced-motion: reduce)` → `animation: none`. No exit animation (it unmounts when the phase leaves `reveal`).
- The visual lifetime is exactly the `reveal` phase (`NOTE_REVEAL_MS`); the component has no timer.

### 12. `TrainingScreen` — `src/components/TrainingScreen.tsx`

Props unchanged. Uses `{ state, boxes, canRepeat, canGiveUp, repeat, giveUp, graph, revealedName }`. Layout (graph always rendered, in every phase, so nothing jumps):

```tsx
<div className="training">
  <p className="training__status" data-testid="training-status" aria-live="polite">{statusText(state)}</p>
  <ol className="note-boxes" aria-label="Melody notes">…</ol>
  <div className="training__actions">
    <button … onClick={repeat} disabled={!canRepeat}>Repeat melody</button>
    <button … onClick={giveUp} disabled={!canGiveUp}>Give up</button>
  </div>
  <PitchGraph store={graph} />
  <NoteRevealOverlay name={revealedName} />
</div>
```

`TrainingScreen` re-renders only on reducer changes (phase, progress, red marks), never per frame; `NoteBox` is unchanged.

**Exact UI strings** (no new text; the overlay shows a note name): `Listen…`, `Get ready…`, `Your turn: play note {n} of {length}` (also during `reveal`, with the already-incremented count), `Well done!` (complete, and the last `reveal`), `Repeat melody`, `Give up`, overlay card = `state.names[i]` (e.g. `Si4`, `Fa#3`, `Sol♭3`).

### 13. CSS — `src/styles.css`

**New theme tokens** (in `:root`, and overridden in the existing `@media (prefers-color-scheme: dark) { :root { … } }` block). Dark values match the mockups; light values keep contrast on a white graph.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--color-graph-bg` | graph background | `#ffffff` | `#111317` |
| `--color-graph-border` | graph border | `#9ca3af` | `#d4d4d4` |
| `--color-graph-centre` | solid centre line | `#6b7280` | `#e5e5e5` |
| `--color-graph-guide` | dashed guides | `#9ca3af` | `#d4d4d4` |
| `--color-graph-band` | grey tolerance band | `#e5e7eb` | `#5f5f5f` |
| `--color-graph-fill` | hold fill (muted, ≠ trail) | `#f2dc8a` | `#5c4d16` |
| `--color-graph-trail` | trail (amber in light for contrast) | `#d97706` | `#ffe135` |
| `--color-graph-dot` | leading dot | `#1f2328` | `#ffffff` |
| `--color-graph-green` | band, correct note | `#a7e8b8` | `#2f5e32` |
| `--color-graph-red` | band, wrong note | `#f6b4b4` | `#5c1010` |
| `--color-reveal-card` | overlay card | `#86efac` | `#86ff6b` |
| `--color-reveal-text` | overlay card text | `#052e16` | `#0b0b0b` |
| `--color-reveal-backdrop` | dim layer | `rgb(0 0 0 / 0.35)` | `rgb(0 0 0 / 0.6)` |

**Rules:**
- `.pitch-graph`: `display: block; width: 100%; height: auto; margin-top: 1.5rem; background: var(--color-graph-bg); border: 1px solid var(--color-graph-border); border-radius: 0.25rem`. It spans the training column, i.e. the same box as `.note-boxes` and `.training__actions` (the boxes are centred inside it); the viewBox (8:5) keeps proportions, so at 320 px viewport it is 288 × 180 px, with no horizontal scroll.
- `.pitch-graph__band { fill: var(--color-graph-band) }`, `--green` → `--color-graph-green`, `--red` → `--color-graph-red`, `--filling` / `--idle` keep grey; `.pitch-graph__fill { fill: var(--color-graph-fill) }`.
- `.pitch-graph__guide { stroke: var(--color-graph-guide); stroke-width: 1px; stroke-dasharray: 4 4 }`, `.pitch-graph__centre { stroke: var(--color-graph-centre); stroke-width: 1.5px }`, `.pitch-graph__trail { fill: none; stroke: var(--color-graph-trail); stroke-width: 4px; stroke-linecap: round; stroke-linejoin: round }`, `.pitch-graph__dot { fill: var(--color-graph-dot) }`; lines and trail use `vector-effect: non-scaling-stroke` so stroke widths stay in CSS pixels at any width.
- `.note-reveal__backdrop`: fixed, `inset: 0`, `z-index: 10`, `background: var(--color-reveal-backdrop)`, `backdrop-filter: blur(4px)` (+ `-webkit-backdrop-filter`), `pointer-events: none`, `animation: note-reveal-fade 120ms ease-out`.
- `.note-reveal__card`: fixed, centred (`top: 50%; left: 50%; transform: translate(-50%, -50%)`), `z-index: 11`, `display: flex` centred, `width: min(18rem, 75vw); aspect-ratio: 1; margin: 0; border-radius: 2rem; background: var(--color-reveal-card); color: var(--color-reveal-text); font-size: clamp(2.5rem, 12vw, 4rem); font-weight: 700; pointer-events: none; animation: note-reveal-pop 150ms ease-out` (keyframes from `opacity: 0` and `scale(0.9)` inside the same translate).
- `@media (prefers-reduced-motion: reduce) { .note-reveal__backdrop, .note-reveal__card { animation: none } }`.

## UI Mockups

Legend: `░` grey band · `▓` hold fill (muted yellow) · `▒` green band · `▚` red band · `~` trail · `●` dot (x = 80 %) · `- -` dashed guides (±12.5, ±25 = band edges, ±37.5 c) · `───` centre line. Labels on the right are annotations, never rendered.

### Training, phone width (320 px), listening, filling

```
┌──────────────────────────────┐
│                        [ ⚙ ] │
│ Your turn: play note 1 of 5  │
│  [    ][    ][    ][    ]    │
│           [    ]             │
│ [ Repeat melody ]            │
│ [ Give up ]                  │
│ ┌──────────────────────────┐ │
│ │~~ - - - - - - - - - - - -│ │ +37.5
│ │▓▓~▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░│ │ +25 (band edge)
│ │▓▓▓~~~▓▓▓▓▓░░░░░░░░░░░░░░░│ │
│ │▓▓▓▓▓▓~~~~~~~~~──●────────│ │ 0 (centre)
│ │▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░│ │
│ │▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░│ │ −25
│ │ - - - - - - - - - - - - -│ │ −37.5
│ └──────────────────────────┘ │
└──────────────────────────────┘
```
Fill = 40 % of the width (200 ms of 500 ms in tune). `data-band-state="filling"`.

### Graph states (desktop width; same layout above the graph)

**1. Empty** — before any pitch in the exercise (also during the first playback): grey band, no trail, no dot. `idle`.
```
┌──────────────────────────────────────────┐
│ - - - - - - - - - - - - - - - - - - - - -│ +37.5
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ +25
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│──────────────────────────────────────────│ 0
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ −25
│ - - - - - - - - - - - - - - - - - - - - -│ −37.5
└──────────────────────────────────────────┘
```

**2. Trail + dot, outside the band** (mockup 1): the pitch came from +45 c down to −20 c; nothing fills while outside ±25 c. `idle`.
```
┌──────────────────────────────────────────┐
│~~~~~ - - - - - - - - - - - - - - - - - - │ +37.5
│░░░░~~~~░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ +25
│░░░░░░░░~~~~~~░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│──────────────~~~~~~~~~───────────────────│ 0
│░░░░░░░░░░░░░░░░░░░░░~~~~~~~●░░░░░░░░░░░░░│ −20 c
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ −25
│ - - - - - - - - - - - - - - - - - - - - -│ −37.5
└──────────────────────────────────────────┘
```

**3. Filling** (mockup 2): in tune for 300 ms → fill 60 %. `filling`, `pitch-graph-fill` width 192.
```
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░│ +25
│▓▓▓▓▓▓▓▓▓~~~~~~▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░│
│─────────────────~~~~~~~~~~~~~●───────────│ 0
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░│ −25
```

**4. Correct note: green band + overlay** (mockups 3 and 5): the band turns green on the accepting frame; the overlay appears at once; box 1 is green and the status has advanced; everything behind the card is blurred and dimmed; the dot is gone (microphone ignored). `green`, `note-reveal` = "Fa#3". After `NOTE_REVEAL_MS`: overlay removed, band grey (`idle`), the old trail scrolls out.
```
┌──────────────────────────────────────────┐
│ ·· dimmed + blurred ··              [ ⚙ ]│
│ Your turn: play note 2 of 5              │
│ [Fa#3][    ][    ][    ][    ]           │
│ [ Repeat melody ]   ┌──────────┐ Give up ]│  ← Give up still clickable
│ ┌───────────────────│          │───────┐ │
│ │▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│   Fa#3   │▒▒▒▒▒▒▒│ │
│ │──────~~~~~~~~~~~~~│          │───────│ │
│ │▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒└──────────┘▒▒▒▒▒▒▒│ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```
Last note: same overlay, status `Well done!`, all boxes green; `COMPLETE_PAUSE_MS` starts when the overlay goes away.

**5. Wrong note: red band** (mockup 4): another note held in tune for 500 ms. `red`, no fill; status and boxes unchanged; nothing announced. Whenever the graph is centred on that note again (including after Repeat, and while silent since the centre persists) the band is red, until the current melody note is guessed.
```
│ - - - - - - - - - - - - - - - - - - - - -│ +37.5
│▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚│ +25
│▚▚▚▚~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~●▚▚▚▚▚▚▚│ 0 (+5 c)
│▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚│ −25
│ - - - - - - - - - - - - - - - - - - - - -│ −37.5
```

**6. Wrap-around** (idea §4.3): left — descending through −50 c of Fa (centre Fa); right — one frame later the nearest note is Mi: the graph re-centres on Mi, the dot appears near +50 c, and the earlier readings (now above +50 c relative to Mi) leave through the top edge.
```
 centre Fa                                   centre Mi
┌────────────────────────┐                 ┌────────────────────────┐
│ - - - - - - - - - - - -│                 │~~~~~~~~~~~~~~~~~~~ ~●  │ ← top edge
│░░░░░░░░░░░░░░░░░░░░░░░░│                 │░░░░░░░░░░░░░░░░░░░░░░░░│
│~~~~~~~~──────────────── │                │────────────────────────│
│░░░░░░░░~~~~~~~~░░░░░░░░│                 │░░░░░░░░░░░░░░░░░░░░░░░░│
│ - - - - - - - - ~~~~~~●│ ← −48 c         │ - - - - - - - - - - - -│
└────────────────────────┘                 └────────────────────────┘
```
Fa/Mi/Fa example: on returning to Fa, the earlier 200 ms of Fa reappear on the left, then a gap (Mi, below the bottom edge, the line leaves and re-enters through it), then the current Fa up to the dot.

**7. Silence / after Repeat**: no dot; the trail keeps scrolling left and is gone `PITCH_TRAIL_MS` after the last reading; the band keeps the last centre's colour (grey, or red if that note is red). Playback and guard look like this too.
```
│░░░░░░~~~~~~░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│────────────~~~───────────────────────────│   (no ●)
```

**8. Light vs dark:** same geometry; only the tokens of §13 change. Dark: white dot, bright yellow trail, olive fill on grey band (mockups). Light: dark dot, amber trail, pale gold fill on light-grey band, white graph background, pastel green/red bands, lighter dim layer.

## Acceptance Criteria — Part 2

**Graph**
- [ ] On Training, `pitch-graph` is rendered below the buttons in every phase (playing, guard, listening, reveal, complete), `aria-hidden="true"`, with no text content; it fits the column at 320 px without horizontal scroll.
- [ ] Before any pitch: `data-band-state="idle"`, no trail, no dot.
- [ ] While listening with a valid pitch: a dot at `cx` 256 whose `cy` follows the smoothed cents; trail polylines to its left; nothing to the right of 80 %.
- [ ] A frame without valid pitch (silence, below threshold, no detection, or any phase other than listening) removes the dot; the trail disappears `PITCH_TRAIL_MS` after the last reading and is still visible shortly before.
- [ ] In tune: `filling` with `pitch-graph-fill` width = progress × 320; leaving the band, silence or a wrap removes the fill.
- [ ] Correct note: `green` from the accepting frame until the reveal ends; then `idle`.
- [ ] Wrong note (incl. octave): `red` with no fill; persists through silence and Repeat (playing/guard/listening) while centred on it; cleared after the correct note (holding it then fills again).
- [ ] Only `PitchGraph` re-renders per frame (hook render count unchanged over listening frames without a result).

**Overlay**
- [ ] On acceptance: `note-reveal` shows the box's name (e.g. `Si4`) inside the `role="status"` region; the box is `done`; status advanced; Repeat disabled; Give up enabled.
- [ ] It is still shown at `NOTE_REVEAL_MS − TIMER_DRIFT_MARGIN_MS` and gone at `NOTE_REVEAL_MS`; frames during it never fill or show a dot.
- [ ] Give up during the overlay returns Home immediately and releases the mic; in Chromium the Give up button is the hit-test target at its centre while the overlay is visible.
- [ ] Last note: overlay, then `Well done!` stays for `COMPLETE_PAUSE_MS`, then Home.
- [ ] Reduced motion: no animation on backdrop or card.

**Theme**
- [ ] Every graph/overlay colour comes from a token with light and dark values; no hard-coded colours in the new rules.

## Technical Requirements — E2E (`e2e/training.spec.ts`)

The fake mic is a looping 440 Hz tone = concert A4 = written Si4 (71). `locator.waitFor({ state: 'visible' })` waits in the page (animation-frame polling), so it catches the 500 ms overlay; do not rely on `expect(...).toBeVisible()` retries for it.

1. **Matching melody (update):** `/?melody=71,71,71,71,71` → Start → `pitch-graph` visible. For each `i` in 0..4: `await reveal.waitFor({ state: 'visible', timeout: 15_000 })`, `expect(reveal).toHaveText('Si4')`, `await reveal.waitFor({ state: 'hidden' })`, box `i` `done` with text `Si4`. Then Home.
2. **Wrong note (update of the "never advances" test):** `/?melody=60,60,60,60,60` → Start → `expect(graph).toHaveAttribute('data-band-state', 'red', { timeout: 15_000 })`; no box `done`; no `note-reveal`. Click Repeat melody → still `red` right away (status `Listen…`), and again once Repeat melody is enabled (timeout 15 s). Give up → Home.
3. **Give up during the overlay (new):** `/?melody=71,60,60,60,60` → Start → `reveal.waitFor({ state: 'visible', timeout: 15_000 })` → evaluate on the Give up button: `document.elementFromPoint(centre) === button` and `document.querySelector('[data-testid="note-reveal"]') !== null` → both true → click Give up → Start training visible.

Timing: playback 5 × 1000 ms + guard + 5 × (500 ms hold + 500 ms reveal) + 1.5 s ≈ 12 s < 30 s test timeout. `e2e/settings.spec.ts` (`71,71,71,60,60`, 15 s per box) and `e2e/mic-meter.spec.ts` need no change.

## Testing Decisions — Part 2

Component tests render through `AudioServicesProvider` with `createFakeAudioServices()`, `vi.useFakeTimers({ shouldAdvanceTime: true })`, async steps in `act`, timer boundaries with `TIMER_DRIFT_MARGIN_MS`. Frames are driven with `createSessionDriver` (`FRAME_MS` 20; `hold(null, ms)` emits no-pitch frames; `reveal()` / `matchNote()` from Part 1). Remember that frame timestamps (driver clock) are the graph clock and are independent of fake timers, and that a constant tone gives a constant smoothed value.

| File | Status | Covers |
|---|---|---|
| `src/training/pitchGraphStore.test.ts` | new | initial snapshot; publish updates + notifies; equal view → no notify, same reference; unsubscribe (idempotent) |
| `src/components/PitchGraph.test.tsx` | new | `aria-hidden`, `data-band-state`; band rect y 50 / height 100; 6 guides + centre line; fill rect only when filling (width 128 for 0.4); polylines per segment with mapped `points`; dot `cx` 256, `cy` = (1 − y)/2 × 200, absent when null; updates on `publish` inside `act`; unsubscribes on unmount |
| `src/components/NoteRevealOverlay.test.tsx` | new | `null` → empty `role="status"` region, no card; `"Fa#3"` → card text, region text `Fa#3`, backdrop `aria-hidden`; back to `null` removes the card |
| `src/training/useTrainingSession.test.tsx` | update | `graph` identity stable across rerenders; `revealedName` `Si4` during reveal only; store snapshot: `green` on the matching frame (same `act`), `idle` after `reveal()` without new frames (sync effect), `red` on the completing wrong frame |
| `src/components/App.test.tsx` | update | graph present in every phase; idle + no dot/trail before pitch; dot present with a tone in listening, absent with a null frame and with a tone during playing/guard; `filling` after 240 ms (fill width ≈ 153.6), `idle` after a null frame; overlay `Si4` + status "play note 2 of 5" + Repeat disabled + Give up enabled, still at `NOTE_REVEAL_MS − margin`, gone at `NOTE_REVEAL_MS` with band `idle`; tone during reveal → no dot, still green; wrong note (`MELODY[0] + 1`, and octave up) → `red`, boxes/status unchanged, no overlay; red persists after null frames and through Repeat → guard → listening; after the correct note, holding that pitch for 240 ms shows `filling`; Give up during reveal → Home + released; last note → overlay `Fa#4` + `Well done!`, Home only after `NOTE_REVEAL_MS` + `COMPLETE_PAUSE_MS`; trail present after `PITCH_TRAIL_MS − 200` ms of null frames, none after `PITCH_TRAIL_MS + FRAME_MS` |
| `e2e/training.spec.ts` | update | see E2E |

`listenerCount` expectations: the training session has 1 listener from Start until release in every phase (Part 1 changes); the Home "Test microphone" assertions in `App.test.tsx` (lines ~77/87) are unaffected. CSS (blur, pointer-events, colours, reduced motion) is not applied in jsdom: pointer-through is covered by e2e test 3, the rest by the manual checklist.

## Risks

- **`backdrop-filter` support/performance:** older browsers or low-end phones may skip or stutter the blur; the dim colour alone still separates the card. Checked manually (iOS Safari needs the `-webkit-` prefix).
- **Smoothing changes the feel of acceptance:** slides into a note are accepted ≈ 60–80 ms later; wobbles no longer reset. Deliberate (user request); verify with a real trumpet.
- **Per-frame allocation:** the model and view are rebuilt every frame (~50 readings); negligible, but keep the work O(readings) and skip identical publishes (`viewsEqual`).
- **Short-lived overlay in e2e:** 500 ms windows are missed by back-off polling; tests use in-page `waitFor`.
- **Two polite announcements at reveal start** (name + status) may be read in either order; both are short and different.
- **Mic loop runs in every phase:** the rAF loop now runs during playback; it only advances the graph (no level or pitch computation), so cost is minimal.

## `CLAUDE.md` Updates

- Intro: mention the live pitch graph (cents from the closest note, fill while held, green/red result, red marks per melody note) and the reveal overlay of correct notes; acceptance uses the smoothed pitch.
- Specs list: add `specs/pitch-feedback-graph/idea.md` (source of truth), `prd.md` (Part 1: constants, note helpers, smoother, hold tracker, graph model, reducer, minimal hook) and `prd2.md` (Part 2: graph store, hook graph wiring, `PitchGraph`, `NoteRevealOverlay`, styles, tests, e2e); Status: implemented.
- Architecture map: replace the `sustainTracker.ts` line with `src/training/holdTracker.ts` (nearest-semitone hold runs, wrong notes never fill, `completed` once per run); add `src/audio/pitchSmoother.ts` (time-based EMA on fractional MIDI, reset on gaps), `src/training/pitchGraph.ts` (trail model, clipping, band state, view), `src/training/pitchGraphStore.ts`, `src/components/PitchGraph.tsx`, `src/components/NoteRevealOverlay.tsx`; update `notes.ts` (`hzToMidi`, `nearestMidi`, `centsOffset`), `constants.ts` (graph/reveal/smoothing constants), `trainingReducer.ts` (`reveal` phase, `wrongNotes`, `wrongNoteHeld`, `revealElapsed`, `selectCanRepeat` / `selectCanGiveUp` / `selectRevealedName` / `selectExpectedNote`), `useTrainingSession.ts` (one mic subscription per session, `dispatchNow` + `stateRef`, reveal timer, graph store), `TrainingScreen.tsx` (graph + overlay), `sessionDriver.ts` (`reveal`, `matchNote`), e2e `training.spec.ts`.
- Conventions: the smoothed pitch drives display **and** acceptance; every hook dispatch goes through `dispatchNow` (frames read `stateRef`); per-frame UI goes through `PitchGraphStore` + `useSyncExternalStore`, never hook state; the graph is decorative (`aria-hidden`), wrong notes are visual only; colours are light/dark tokens in `:root`; overlay layers use `pointer-events: none`; e2e waits for the overlay with `locator.waitFor`.

## Manual Validation Checklist

- [ ] Real trumpet, desktop Chrome/Firefox and iOS Safari/Android Chrome: the dot follows intonation smoothly; sharp/flat moves up/down; a held note fills in ~0.5 s.
- [ ] Wrong note turns red and stays red after Repeat; the correct note shows the green card with the right name, then grey band and listening resumes.
- [ ] Sliding to a neighbour note wraps the graph without the line jumping across.
- [ ] Silence: dot disappears, trail gone after ~1 s.
- [ ] Light and dark themes readable; 320 px width; reduced motion → no animation; Give up tappable during the card on a phone.
- [ ] Screen reader: the revealed name is announced once; wrong notes are not announced.
