import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PITCH_GRAPH_DOT_RADIUS } from '../config/constants';
import { EMPTY_PITCH_GRAPH_VIEW, type PitchGraphView } from '../training/pitchGraph';
import { createPitchGraphStore } from '../training/pitchGraphStore';
import { PitchGraph } from './PitchGraph';

const graph = () => screen.getByTestId('pitch-graph');
const band = () => screen.getByTestId('pitch-graph-band');
const fillRect = () => screen.queryByTestId('pitch-graph-fill');
const dot = () => screen.queryByTestId('pitch-graph-dot');
const trails = () => screen.queryAllByTestId('pitch-graph-trail');

const FILLING: PitchGraphView = {
  segments: [
    [
      { x: 0, y: 1 },
      { x: 0.25, y: 0.5 },
      { x: 0.5, y: -0.123456 },
    ],
    [
      { x: 0.6, y: 0 },
      { x: 0.8, y: -0.4 },
    ],
  ],
  dot: { x: 0.8, y: -0.4 },
  bandState: 'filling',
  fill: 0.4,
};

function renderGraph(initial: PitchGraphView = EMPTY_PITCH_GRAPH_VIEW) {
  const store = createPitchGraphStore(initial);
  const utils = render(<PitchGraph store={store} />);
  return { store, ...utils };
}

describe('PitchGraph', () => {
  it('is a decorative 320 × 200 svg with no text', () => {
    renderGraph();
    expect(graph().tagName.toLowerCase()).toBe('svg');
    expect(graph()).toHaveAttribute('aria-hidden', 'true');
    expect(graph()).toHaveAttribute('focusable', 'false');
    expect(graph()).toHaveAttribute('viewBox', '0 0 320 200');
    expect(graph()).toHaveClass('pitch-graph');
    expect(graph().textContent).toBe('');
  });

  it('empty view: idle band (y 50, height 100, full width), no fill, no trail, no dot', () => {
    renderGraph();
    expect(graph()).toHaveAttribute('data-band-state', 'idle');
    expect(band()).toHaveAttribute('x', '0');
    expect(band()).toHaveAttribute('y', '50');
    expect(band()).toHaveAttribute('width', '320');
    expect(band()).toHaveAttribute('height', '100');
    expect(band()).toHaveClass('pitch-graph__band', 'pitch-graph__band--idle');
    expect(fillRect()).toBeNull();
    expect(trails()).toHaveLength(0);
    expect(dot()).toBeNull();
  });

  it('draws 6 dashed guides at ±12.5, ±25, ±37.5 c and the centre line', () => {
    const { container } = renderGraph();
    const guides = [...container.querySelectorAll('.pitch-graph__guide')];
    expect(guides.map((line) => line.getAttribute('y1'))).toEqual(['175', '150', '125', '75', '50', '25']);
    for (const line of guides) {
      expect(line.getAttribute('y2')).toBe(line.getAttribute('y1'));
      expect(line).toHaveAttribute('x1', '0');
      expect(line).toHaveAttribute('x2', '320');
    }
    const centre = container.querySelectorAll('.pitch-graph__centre');
    expect(centre).toHaveLength(1);
    expect(centre[0]).toHaveAttribute('y1', '100');
    expect(centre[0]).toHaveAttribute('y2', '100');
    expect(centre[0]).toHaveAttribute('x2', '320');
  });

  it('filling: fill rect over the band with width = fill × 320', () => {
    renderGraph(FILLING);
    expect(graph()).toHaveAttribute('data-band-state', 'filling');
    expect(band()).toHaveClass('pitch-graph__band--filling');
    expect(fillRect()).toHaveAttribute('x', '0');
    expect(fillRect()).toHaveAttribute('y', '50');
    expect(fillRect()).toHaveAttribute('width', '128');
    expect(fillRect()).toHaveAttribute('height', '100');
    expect(fillRect()).toHaveClass('pitch-graph__fill');
  });

  it('one polyline per segment with mapped, 2-decimal points', () => {
    renderGraph(FILLING);
    expect(trails().map((line) => line.getAttribute('points'))).toEqual([
      '0,0 80,50 160,112.35',
      '192,100 256,140',
    ]);
    expect(trails()[0]).toHaveClass('pitch-graph__trail');
  });

  it('dot at cx 256, cy = (1 − y) / 2 × 200, radius from the constants', () => {
    renderGraph(FILLING);
    expect(dot()).toHaveAttribute('cx', '256');
    expect(dot()).toHaveAttribute('cy', '140');
    expect(dot()).toHaveAttribute('r', String(PITCH_GRAPH_DOT_RADIUS));
    expect(dot()).toHaveClass('pitch-graph__dot');
  });

  it.each(['green', 'red', 'idle'] as const)('%s band: class and data-band-state, no fill rect', (bandState) => {
    renderGraph({ ...FILLING, bandState, fill: 0 });
    expect(graph()).toHaveAttribute('data-band-state', bandState);
    expect(band()).toHaveClass(`pitch-graph__band--${bandState}`);
    expect(fillRect()).toBeNull();
  });

  it('re-renders on publish', () => {
    const { store } = renderGraph();
    act(() => store.publish(FILLING));
    expect(graph()).toHaveAttribute('data-band-state', 'filling');
    expect(trails()).toHaveLength(2);
    expect(dot()).not.toBeNull();
    act(() => store.publish({ ...FILLING, dot: null, bandState: 'red', fill: 0 }));
    expect(graph()).toHaveAttribute('data-band-state', 'red');
    expect(dot()).toBeNull();
    expect(fillRect()).toBeNull();
  });

  it('unsubscribes on unmount', () => {
    const store = createPitchGraphStore();
    const unsubscribe = vi.fn();
    const subscribe = vi.spyOn(store, 'subscribe');
    subscribe.mockImplementation(() => unsubscribe);
    const { unmount } = render(<PitchGraph store={store} />);
    expect(subscribe).toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
