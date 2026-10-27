import {
  CENTS_PER_SEMITONE,
  PITCH_GRAPH_DOT_X,
  PITCH_GRAPH_GUIDE_CENTS,
  PITCH_GRAPH_RANGE_CENTS,
  PITCH_TRAIL_MS,
  TOLERANCE_CENTS,
} from '../config/constants';
import { nearestMidi, type ConcertMidi } from '../music/notes';

/** One frame for the graph: smoothed fractional concert MIDI, or null (no valid pitch / mic ignored). */
export interface PitchReading {
  timeMs: number;
  midi: number | null;
}

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

export const EMPTY_PITCH_GRAPH_MODEL: PitchGraphModel = Object.freeze({
  readings: Object.freeze([]),
  centre: null,
  nowMs: null,
  hasPitch: false,
});

export type BandState = 'idle' | 'filling' | 'green' | 'red';

/** x: 0 (left) .. 1 (right) of the width; y: −1 (bottom, −RANGE c) .. +1 (top, +RANGE c). */
export interface GraphPoint {
  x: number;
  y: number;
}

export interface PitchGraphStatus {
  /** HoldStatus.progress of the newest frame (0 outside listening). */
  progress: number;
  /** Reducer state. */
  wrongNotes: readonly ConcertMidi[];
  /** phase === 'reveal'. */
  revealing: boolean;
}

export interface PitchGraphView {
  /** Visible trail polylines, oldest first, each with >= 2 points. */
  segments: readonly (readonly GraphPoint[])[];
  /** Leading dot at x = PITCH_GRAPH_DOT_X; null when the newest frame has no pitch or while revealing. */
  dot: GraphPoint | null;
  bandState: BandState;
  /** Fill width as a fraction of the graph width; > 0 only when bandState is 'filling'. */
  fill: number;
}

export const EMPTY_PITCH_GRAPH_VIEW: PitchGraphView = Object.freeze({
  segments: Object.freeze([]),
  dot: null,
  bandState: 'idle',
  fill: 0,
});

/** Band half-height in y units: TOLERANCE_CENTS / PITCH_GRAPH_RANGE_CENTS (= 0.25). */
export const PITCH_GRAPH_BAND_HALF_HEIGHT = TOLERANCE_CENTS / PITCH_GRAPH_RANGE_CENTS;

/** Dashed guide levels in y units, excluding 0: multiples of GUIDE/RANGE strictly inside (−1, 1). */
export const PITCH_GRAPH_GUIDE_LEVELS: readonly number[] = (() => {
  const step = PITCH_GRAPH_GUIDE_CENTS / PITCH_GRAPH_RANGE_CENTS;
  const levels: number[] = [];
  for (let k = Math.ceil(1 / step) - 1; k >= 1; k -= 1) {
    if (k * step < 1) levels.push(-k * step);
  }
  return Object.freeze([...levels, ...levels.map((level) => -level).reverse()]);
})();

/** Graph edges in y units (inclusive). */
const TOP = 1;
const BOTTOM = -1;

/**
 * Adds one frame: a valid reading (re-centres the graph on its nearest note) or a gap marker
 * (only after a valid reading; the centre persists through silence). Drops readings older than
 * `trailMs` and any leading gap marker.
 */
export function advancePitchGraph(
  model: PitchGraphModel,
  { timeMs, midi }: PitchReading,
  trailMs: number = PITCH_TRAIL_MS,
): PitchGraphModel {
  const last = model.readings.at(-1);
  const added: PitchReading | null =
    midi !== null ? { timeMs, midi } : last !== undefined && last.midi !== null ? { timeMs, midi: null } : null;

  // Prune the existing readings, then copy once (never sharing or mutating the input's array).
  const prior = model.readings;
  let first = 0;
  while (first < prior.length && timeMs - prior[first].timeMs > trailMs) first += 1;
  while (first < prior.length && prior[first].midi === null) first += 1;
  const readings = prior.slice(first);
  // A gap marker never starts the trail; a new valid reading is always within the trail.
  if (added !== null && (readings.length > 0 || added.midi !== null)) readings.push(added);

  return {
    readings,
    centre: midi !== null ? nearestMidi(midi) : model.centre,
    nowMs: timeMs,
    hasPitch: midi !== null,
  };
}

const edgeBeyond = (y: number): number | null => (y > TOP ? TOP : y < BOTTOM ? BOTTOM : null);

/** Point where the line A→B crosses the horizontal `edge`. */
function crossing(a: GraphPoint, b: GraphPoint, edge: number): GraphPoint {
  const t = (edge - a.y) / (b.y - a.y);
  return { x: a.x + t * (b.x - a.x), y: edge };
}

/** Clips the line A→B to −1 ≤ y ≤ 1; null when nothing of it is visible. */
function clipPair(a: GraphPoint, b: GraphPoint): [GraphPoint, GraphPoint] | null {
  const edgeA = edgeBeyond(a.y);
  const edgeB = edgeBeyond(b.y);
  if (edgeA === null && edgeB === null) return [a, b];
  if (edgeA !== null && edgeA === edgeB) return null;
  return [edgeA === null ? a : crossing(a, b, edgeA), edgeB === null ? b : crossing(a, b, edgeB)];
}

/** Clipped polylines of one run of consecutive valid points. */
function clipRun(points: readonly GraphPoint[], into: GraphPoint[][]): void {
  let current: GraphPoint[] | null = null;
  for (let i = 1; i < points.length; i += 1) {
    const piece = clipPair(points[i - 1], points[i]);
    if (piece === null) {
      current = null;
      continue;
    }
    // Consecutive pieces share an endpoint exactly when their common reading is inside the graph.
    if (current !== null && current.at(-1) === piece[0]) {
      current.push(piece[1]);
    } else {
      current = [piece[0], piece[1]];
      into.push(current);
    }
  }
}

function bandStateOf(centre: ConcertMidi | null, { progress, wrongNotes, revealing }: PitchGraphStatus): BandState {
  if (revealing) return 'green';
  if (centre === null) return 'idle';
  if (wrongNotes.includes(centre)) return 'red';
  return progress > 0 ? 'filling' : 'idle';
}

/** Precomputes everything the graph draws: clipped trail polylines, dot, band state and fill. */
export function computePitchGraphView(
  model: PitchGraphModel,
  status: PitchGraphStatus,
  trailMs: number = PITCH_TRAIL_MS,
): PitchGraphView {
  const bandState = bandStateOf(model.centre, status);
  const fill = bandState === 'filling' ? status.progress : 0;
  const { nowMs, centre } = model;
  if (nowMs === null || centre === null) {
    // Without a centre there are no readings (every valid reading sets it): nothing to draw.
    if (bandState === EMPTY_PITCH_GRAPH_VIEW.bandState) return EMPTY_PITCH_GRAPH_VIEW;
    return { ...EMPTY_PITCH_GRAPH_VIEW, bandState };
  }

  const toPoint = (timeMs: number, midi: number): GraphPoint => ({
    x: PITCH_GRAPH_DOT_X * (1 - (nowMs - timeMs) / trailMs),
    y: ((midi - centre) * CENTS_PER_SEMITONE) / PITCH_GRAPH_RANGE_CENTS,
  });

  const segments: GraphPoint[][] = [];
  let run: GraphPoint[] = [];
  let newest: GraphPoint | null = null;
  for (const { timeMs, midi } of model.readings) {
    if (midi === null) {
      clipRun(run, segments);
      run = [];
      continue;
    }
    newest = toPoint(timeMs, midi);
    run.push(newest);
  }
  clipRun(run, segments);

  // No dot under the reveal card: the accepting frame already publishes with `revealing`.
  const dot =
    model.hasPitch && newest !== null && !status.revealing ? { x: PITCH_GRAPH_DOT_X, y: newest.y } : null;
  return { segments, dot, bandState, fill };
}

const pointsEqual = (a: GraphPoint | null, b: GraphPoint | null): boolean =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y);

/** Structural equality (segments, points, dot, bandState, fill); used to skip identical publishes. */
export function viewsEqual(a: PitchGraphView, b: PitchGraphView): boolean {
  if (a.bandState !== b.bandState || a.fill !== b.fill || !pointsEqual(a.dot, b.dot)) return false;
  if (a.segments.length !== b.segments.length) return false;
  return a.segments.every((segment, i) => {
    const other = b.segments[i];
    return segment.length === other.length && segment.every((p, j) => pointsEqual(p, other[j]));
  });
}
