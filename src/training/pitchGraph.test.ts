import { describe, expect, it } from 'vitest';
import { PITCH_GRAPH_DOT_X, PITCH_TRAIL_MS } from '../config/constants';
import {
  advancePitchGraph,
  computePitchGraphView,
  EMPTY_PITCH_GRAPH_MODEL,
  EMPTY_PITCH_GRAPH_VIEW,
  PITCH_GRAPH_BAND_HALF_HEIGHT,
  PITCH_GRAPH_GUIDE_LEVELS,
  viewsEqual,
  type GraphPoint,
  type PitchGraphModel,
  type PitchGraphStatus,
  type PitchGraphView,
} from './pitchGraph';

const STEP_MS = 20;
const LISTENING: PitchGraphStatus = { progress: 0, wrongNotes: [], revealing: false };

/** Feeds `midiAt(t)` every 20 ms for t in [from, to] (inclusive). */
function feed(
  model: PitchGraphModel,
  from: number,
  to: number,
  midiAt: (t: number) => number | null,
  trailMs?: number,
): PitchGraphModel {
  let m = model;
  for (let t = from; t <= to; t += STEP_MS) m = advancePitchGraph(m, { timeMs: t, midi: midiAt(t) }, trailMs);
  return m;
}

const constant = (midi: number | null) => () => midi;

function expectPoint(actual: GraphPoint | undefined, expected: GraphPoint): void {
  expect(actual).toBeDefined();
  expect(actual?.x).toBeCloseTo(expected.x, 6);
  expect(actual?.y).toBeCloseTo(expected.y, 6);
}

/** x of a reading at time t when the newest frame is at `now` (default trail). */
const xAt = (t: number, now: number, trailMs = PITCH_TRAIL_MS): number =>
  PITCH_GRAPH_DOT_X * (1 - (now - t) / trailMs);

describe('pitch graph constants', () => {
  it('band half-height is TOLERANCE / RANGE = 0.25', () => {
    expect(PITCH_GRAPH_BAND_HALF_HEIGHT).toBe(0.25);
  });

  it('guide levels are the multiples of 0.25 strictly inside (−1, 1), without 0', () => {
    expect(PITCH_GRAPH_GUIDE_LEVELS).toEqual([-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]);
  });

  it('the empty model and view', () => {
    expect(EMPTY_PITCH_GRAPH_MODEL).toEqual({ readings: [], centre: null, nowMs: null, hasPitch: false });
    expect(EMPTY_PITCH_GRAPH_VIEW).toEqual({ segments: [], dot: null, bandState: 'idle', fill: 0 });
  });
});

describe('advancePitchGraph', () => {
  it('only null frames from the start keep no readings and no centre', () => {
    const model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 400, constant(null));
    expect(model.readings).toEqual([]);
    expect(model.centre).toBeNull();
    expect(model.nowMs).toBe(400);
    expect(model.hasPitch).toBe(false);
    expect(computePitchGraphView(model, LISTENING)).toEqual(EMPTY_PITCH_GRAPH_VIEW);
  });

  it('appends valid readings, centres on the nearest note and marks hasPitch', () => {
    const model = advancePitchGraph(EMPTY_PITCH_GRAPH_MODEL, { timeMs: 0, midi: 69.4 });
    expect(model).toEqual({ readings: [{ timeMs: 0, midi: 69.4 }], centre: 69, nowMs: 0, hasPitch: true });
  });

  it('does not mutate the previous model', () => {
    const before = advancePitchGraph(EMPTY_PITCH_GRAPH_MODEL, { timeMs: 0, midi: 69 });
    advancePitchGraph(before, { timeMs: 20, midi: 70 });
    expect(before.readings).toHaveLength(1);
    expect(before.centre).toBe(69);
  });

  it('prunes readings older than the trail', () => {
    const model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 1500, constant(69));
    expect(model.readings[0].timeMs).toBe(500);
    for (const r of model.readings) expect(1500 - r.timeMs).toBeLessThanOrEqual(PITCH_TRAIL_MS);
  });

  it('stores a single gap marker per null run', () => {
    let model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 200, constant(69));
    model = feed(model, 220, 400, constant(null));
    expect(model.readings.filter((r) => r.midi === null)).toEqual([{ timeMs: 220, midi: null }]);
    expect(model.hasPitch).toBe(false);
    expect(model.centre).toBe(69);
    model = feed(model, 420, 600, constant(69));
    expect(model.readings.filter((r) => r.midi === null)).toHaveLength(1);
    expect(model.hasPitch).toBe(true);
  });

  it('drops leading gap markers after pruning', () => {
    let model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 200, constant(69));
    model = feed(model, 220, 1300, constant(null));
    expect(model.readings).toEqual([]);
    model = feed(model, 1320, 1340, constant(70));
    expect(model.readings[0]).toEqual({ timeMs: 1320, midi: 70 });
  });
});

describe('computePitchGraphView', () => {
  it('no frames → the empty view', () => {
    expect(computePitchGraphView(EMPTY_PITCH_GRAPH_MODEL, LISTENING)).toEqual(EMPTY_PITCH_GRAPH_VIEW);
  });

  it('a steady 69 for 1 s is one flat segment from x 0 to the dot at 0.8', () => {
    const model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 1000, constant(69));
    const view = computePitchGraphView(model, LISTENING);
    expect(view.segments).toHaveLength(1);
    const [segment] = view.segments;
    expect(segment).toHaveLength(51);
    expectPoint(segment[0], { x: 0, y: 0 });
    expectPoint(segment.at(-1), { x: 0.8, y: 0 });
    for (const p of segment) expect(p.y).toBe(0);
    expect(view.dot).toEqual({ x: 0.8, y: 0 });
  });

  it.each([
    [69.2, 0.4],
    [68.8, -0.4],
    [69.49, 0.98],
  ])('dot y for %s is %s', (midi, y) => {
    const model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 40, constant(midi));
    const view = computePitchGraphView(model, LISTENING);
    expect(view.dot?.x).toBe(PITCH_GRAPH_DOT_X);
    expect(view.dot?.y).toBeCloseTo(y, 6);
    for (const p of view.segments[0]) expect(p.y).toBeCloseTo(y, 6);
  });

  it('a gap splits the trail into 2 segments', () => {
    let model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 200, constant(69));
    model = feed(model, 220, 400, constant(null));
    model = feed(model, 420, 600, constant(69));
    const view = computePitchGraphView(model, LISTENING);
    expect(view.segments).toHaveLength(2);
    expect(view.segments[0]).toHaveLength(11);
    expect(view.segments[1]).toHaveLength(10);
    expectPoint(view.segments[0].at(-1), { x: xAt(200, 600), y: 0 });
    expectPoint(view.segments[1][0], { x: xAt(420, 600), y: 0 });
  });

  it('silence ages the trail out; the dot hides at once and the centre persists', () => {
    // Decision: the PRD row says "segments until t 1200 inclusive"; by the pruning rule
    // (drop nowMs − t > trailMs) only the t 200 reading is left at 1200, and a single reading draws
    // no trail, so the last frame with a segment is 1180.
    let model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 200, constant(69));
    for (let t = 220; t <= 1300; t += STEP_MS) {
      model = advancePitchGraph(model, { timeMs: t, midi: null });
      const view = computePitchGraphView(model, LISTENING);
      expect(view.dot).toBeNull();
      expect(model.centre).toBe(69);
      expect(view.segments.length > 0).toBe(t <= 1180);
    }
  });

  describe('Fa / Mi / Fa (idea §4.3)', () => {
    const faMiFa = (t: number): number => (t < 200 || t >= 700 ? 65 : 64);

    it('at now 900 (back on Fa): earlier Fa, a gap where Mi was, current Fa to the dot', () => {
      const model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 900, faMiFa);
      expect(model.centre).toBe(65);
      const view = computePitchGraphView(model, LISTENING);
      expect(view.segments).toHaveLength(2);
      const [first, second] = view.segments;
      expect(first).toHaveLength(11);
      first.slice(0, 10).forEach((p, i) => expectPoint(p, { x: xAt(i * STEP_MS, 900), y: 0 }));
      expectPoint(first[0], { x: 0.08, y: 0 });
      expectPoint(first[10], { x: 0.232, y: -1 });
      expect(second).toHaveLength(12);
      expectPoint(second[0], { x: 0.632, y: -1 });
      second.slice(1).forEach((p, i) => expectPoint(p, { x: xAt(700 + i * STEP_MS, 900), y: 0 }));
      expectPoint(second.at(-1), { x: 0.8, y: 0 });
      expect(view.dot).toEqual({ x: 0.8, y: 0 });
    });

    it('at now 600 (on Mi): only Mi is visible, entering from the top edge', () => {
      const model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 600, faMiFa);
      expect(model.centre).toBe(64);
      const view = computePitchGraphView(model, LISTENING);
      expect(view.segments).toHaveLength(1);
      const [segment] = view.segments;
      expect(segment).toHaveLength(22);
      expectPoint(segment[0], { x: 0.472, y: 1 });
      segment.slice(1).forEach((p, i) => expectPoint(p, { x: xAt(200 + i * STEP_MS, 600), y: 0 }));
    });
  });

  it('a wrap without a gap leaves through the bottom edge', () => {
    let model = EMPTY_PITCH_GRAPH_MODEL;
    model = advancePitchGraph(model, { timeMs: 0, midi: 69.4 });
    model = advancePitchGraph(model, { timeMs: 20, midi: 69.45 });
    model = advancePitchGraph(model, { timeMs: 40, midi: 69.55 });
    expect(model.centre).toBe(70);
    const view = computePitchGraphView(model, LISTENING);
    expect(view.segments).toHaveLength(1);
    const [segment] = view.segments;
    expect(segment).toHaveLength(2);
    // y −1.1 at t 20 → −0.9 at t 40: the crossing of −1 is halfway, t 30.
    expectPoint(segment[0], { x: xAt(30, 40), y: -1 });
    expectPoint(segment[1], { x: 0.8, y: -0.9 });
    expect(view.dot?.y).toBeCloseTo(-0.9, 6);
  });

  it('a pair beyond opposite edges keeps the piece between the crossings; pieces sharing no endpoint split', () => {
    let model = EMPTY_PITCH_GRAPH_MODEL;
    model = advancePitchGraph(model, { timeMs: 0, midi: 69.75 });
    model = advancePitchGraph(model, { timeMs: 20, midi: 68.25 });
    model = advancePitchGraph(model, { timeMs: 40, midi: 69 });
    expect(model.centre).toBe(69);
    const view = computePitchGraphView(model, LISTENING);
    expect(view.segments).toHaveLength(2);
    expect(view.segments[0]).toHaveLength(2);
    expectPoint(view.segments[0][0], { x: xAt(20 / 6, 40), y: 1 });
    expectPoint(view.segments[0][1], { x: xAt(100 / 6, 40), y: -1 });
    expect(view.segments[1]).toHaveLength(2);
    expectPoint(view.segments[1][0], { x: xAt(80 / 3, 40), y: -1 });
    expectPoint(view.segments[1][1], { x: 0.8, y: 0 });
  });

  it('pairs beyond the same edge are dropped', () => {
    let model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 100, constant(70));
    model = feed(model, 120, 200, constant(69));
    const view = computePitchGraphView(model, LISTENING);
    expect(view.segments).toHaveLength(1);
    const [segment] = view.segments;
    expectPoint(segment[0], { x: xAt(110, 200), y: 1 });
    expect(segment).toHaveLength(6);
    expectPoint(segment.at(-1), { x: 0.8, y: 0 });
  });

  it('a single isolated reading draws no trail but shows the dot', () => {
    const model = advancePitchGraph(EMPTY_PITCH_GRAPH_MODEL, { timeMs: 0, midi: 69 });
    const view = computePitchGraphView(model, LISTENING);
    expect(view.segments).toEqual([]);
    expect(view.dot).toEqual({ x: 0.8, y: 0 });
  });

  it('a red centre persists through 2 s of silence with no trail and no dot', () => {
    let model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 200, constant(70));
    model = feed(model, 220, 2220, constant(null));
    const view = computePitchGraphView(model, { progress: 0, wrongNotes: [70], revealing: false });
    expect(view).toEqual({ segments: [], dot: null, bandState: 'red', fill: 0 });
  });

  it('revealing hides the dot even with pitch; the trail is unchanged', () => {
    const model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 200, constant(69));
    const listening = computePitchGraphView(model, LISTENING);
    const revealing = computePitchGraphView(model, { progress: 0, wrongNotes: [], revealing: true });
    expect(listening.dot).toEqual({ x: 0.8, y: 0 });
    expect(revealing.dot).toBeNull();
    expect(revealing.segments).toEqual(listening.segments);
  });

  describe('band state precedence', () => {
    const on69 = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 100, constant(69));
    const band = (model: PitchGraphModel, status: PitchGraphStatus) => {
      const { bandState, fill } = computePitchGraphView(model, status);
      return { bandState, fill };
    };

    it.each([
      ['revealing (even with progress)', on69, { progress: 0.6, wrongNotes: [69], revealing: true }, 'green', 0],
      ['revealing with no frames', EMPTY_PITCH_GRAPH_MODEL, { progress: 0, wrongNotes: [], revealing: true }, 'green', 0],
      ['no centre', feed(EMPTY_PITCH_GRAPH_MODEL, 0, 100, constant(null)), { progress: 0.4, wrongNotes: [], revealing: false }, 'idle', 0],
      ['centre in wrongNotes (progress ignored)', on69, { progress: 0.4, wrongNotes: [70, 69], revealing: false }, 'red', 0],
      ['progress 0.4', on69, { progress: 0.4, wrongNotes: [70], revealing: false }, 'filling', 0.4],
      ['progress 0', on69, { progress: 0, wrongNotes: [], revealing: false }, 'idle', 0],
    ] as const)('%s → %s', (_label, model, status, bandState, fill) => {
      expect(band(model, status)).toEqual({ bandState, fill });
    });
  });

  it('a longer trail only changes the X scale; the dot stays at 0.8', () => {
    const model = feed(EMPTY_PITCH_GRAPH_MODEL, 0, 2000, constant(69), 2000);
    const view = computePitchGraphView(model, LISTENING, 2000);
    const at1000 = view.segments[0].find((p) => Math.abs(p.x - 0.4) < 1e-9);
    expect(at1000).toBeDefined();
    expectPoint(view.segments[0][50], { x: 0.4, y: 0 });
    expectPoint(view.segments[0][0], { x: 0, y: 0 });
    expect(view.dot).toEqual({ x: 0.8, y: 0 });
  });
});

describe('viewsEqual', () => {
  const base = (): PitchGraphView => ({
    segments: [
      [
        { x: 0.1, y: 0 },
        { x: 0.2, y: 0.1 },
      ],
    ],
    dot: { x: 0.8, y: 0.1 },
    bandState: 'filling',
    fill: 0.3,
  });

  it('is true for structurally equal views', () => {
    expect(viewsEqual(base(), base())).toBe(true);
    expect(viewsEqual(EMPTY_PITCH_GRAPH_VIEW, { segments: [], dot: null, bandState: 'idle', fill: 0 })).toBe(true);
  });

  it.each<[string, (v: PitchGraphView) => PitchGraphView]>([
    ['a point', (v) => ({ ...v, segments: [[v.segments[0][0], { x: 0.2, y: 0.11 }]] })],
    ['a point count', (v) => ({ ...v, segments: [[...v.segments[0], { x: 0.3, y: 0 }]] })],
    ['the segment count', (v) => ({ ...v, segments: [...v.segments, v.segments[0]] })],
    ['the dot', (v) => ({ ...v, dot: { x: 0.8, y: 0.2 } })],
    ['the dot presence', (v) => ({ ...v, dot: null })],
    ['the band state', (v) => ({ ...v, bandState: 'red' })],
    ['the fill', (v) => ({ ...v, fill: 0.31 })],
  ])('is false when %s differs', (_label, change) => {
    expect(viewsEqual(base(), change(base()))).toBe(false);
    expect(viewsEqual(change(base()), base())).toBe(false);
  });
});
