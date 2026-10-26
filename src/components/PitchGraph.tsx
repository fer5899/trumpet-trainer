import { useSyncExternalStore } from 'react';
import {
  PITCH_GRAPH_DOT_RADIUS,
  PITCH_GRAPH_VIEWBOX_HEIGHT,
  PITCH_GRAPH_VIEWBOX_WIDTH,
} from '../config/constants';
import { PITCH_GRAPH_BAND_HALF_HEIGHT, PITCH_GRAPH_GUIDE_LEVELS } from '../training/pitchGraph';
import type { PitchGraphStore } from '../training/pitchGraphStore';

export interface PitchGraphProps {
  store: PitchGraphStore;
}

const W = PITCH_GRAPH_VIEWBOX_WIDTH;
const H = PITCH_GRAPH_VIEWBOX_HEIGHT;

/** Rounds to 2 decimals (keeps the SVG attributes short and stable). */
const round2 = (value: number): number => Math.round(value * 100) / 100;
/** Graph x (0..1) → viewBox x. */
const toX = (x: number): number => round2(x * W);
/** Graph y (−1 bottom .. +1 top) → viewBox y. */
const toY = (y: number): number => round2(((1 - y) / 2) * H);

const BAND_Y = toY(PITCH_GRAPH_BAND_HALF_HEIGHT);
const BAND_HEIGHT = round2(PITCH_GRAPH_BAND_HALF_HEIGHT * H);
/** The guide lines never change: their viewBox y is computed once. */
const GUIDE_YS = PITCH_GRAPH_GUIDE_LEVELS.map(toY);

/**
 * Live pitch graph: draws the precomputed PitchGraphView from the store as SVG. Decorative
 * (aria-hidden), no text and no decisions; it is the only component that re-renders per frame.
 */
export function PitchGraph({ store }: PitchGraphProps): JSX.Element {
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <svg
      className="pitch-graph"
      data-testid="pitch-graph"
      data-band-state={view.bandState}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className={`pitch-graph__band pitch-graph__band--${view.bandState}`}
        data-testid="pitch-graph-band"
        x="0"
        y={BAND_Y}
        width={W}
        height={BAND_HEIGHT}
      />
      {view.fill > 0 && (
        <rect
          className="pitch-graph__fill"
          data-testid="pitch-graph-fill"
          x="0"
          y={BAND_Y}
          width={round2(view.fill * W)}
          height={BAND_HEIGHT}
        />
      )}
      {GUIDE_YS.map((y) => (
        <line key={y} className="pitch-graph__guide" x1="0" x2={W} y1={y} y2={y} />
      ))}
      <line className="pitch-graph__centre" x1="0" x2={W} y1={H / 2} y2={H / 2} />
      {view.segments.map((points, i) => (
        <polyline
          key={i}
          className="pitch-graph__trail"
          data-testid="pitch-graph-trail"
          points={points.map((p) => `${toX(p.x)},${toY(p.y)}`).join(' ')}
        />
      ))}
      {view.dot && (
        <circle
          className="pitch-graph__dot"
          data-testid="pitch-graph-dot"
          cx={toX(view.dot.x)}
          cy={toY(view.dot.y)}
          r={PITCH_GRAPH_DOT_RADIUS}
        />
      )}
    </svg>
  );
}
