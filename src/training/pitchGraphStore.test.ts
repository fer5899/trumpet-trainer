import { describe, expect, it, vi } from 'vitest';
import { EMPTY_PITCH_GRAPH_VIEW, type PitchGraphView } from './pitchGraph';
import { createPitchGraphStore } from './pitchGraphStore';

const filling = (fill: number): PitchGraphView => ({
  segments: [[{ x: 0, y: 0 }, { x: 0.8, y: 0.1 }]],
  dot: { x: 0.8, y: 0.1 },
  bandState: 'filling',
  fill,
});

describe('createPitchGraphStore', () => {
  it('starts with EMPTY_PITCH_GRAPH_VIEW by default', () => {
    expect(createPitchGraphStore().getSnapshot()).toBe(EMPTY_PITCH_GRAPH_VIEW);
  });

  it('starts with the given initial view', () => {
    const initial = filling(0.2);
    expect(createPitchGraphStore(initial).getSnapshot()).toBe(initial);
  });

  it('publish replaces the snapshot and notifies every subscriber', () => {
    const store = createPitchGraphStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    const view = filling(0.4);
    store.publish(view);
    expect(store.getSnapshot()).toBe(view);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('an equal view does not notify and keeps the same snapshot reference', () => {
    const first = filling(0.4);
    const store = createPitchGraphStore(first);
    const listener = vi.fn();
    store.subscribe(listener);
    store.publish(filling(0.4));
    expect(store.getSnapshot()).toBe(first);
    expect(listener).not.toHaveBeenCalled();
    store.publish({ ...EMPTY_PITCH_GRAPH_VIEW });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('getSnapshot returns the same object between publishes', () => {
    const store = createPitchGraphStore();
    store.publish(filling(0.6));
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('unsubscribe stops notifications and is idempotent', () => {
    const store = createPitchGraphStore();
    const listener = vi.fn();
    const other = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.subscribe(other);
    unsubscribe();
    unsubscribe();
    store.publish(filling(0.4));
    expect(listener).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('the same callback subscribed twice gets two independent subscriptions', () => {
    const store = createPitchGraphStore();
    const listener = vi.fn();
    const first = store.subscribe(listener);
    store.subscribe(listener);
    first();
    store.publish(filling(0.4));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
