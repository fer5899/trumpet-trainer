import { EMPTY_PITCH_GRAPH_VIEW, viewsEqual, type PitchGraphView } from './pitchGraph';

/**
 * External store for the per-frame graph view (read with `useSyncExternalStore`), so frames
 * re-render only the graph, never the training hook.
 */
export interface PitchGraphStore {
  getSnapshot(): PitchGraphView;
  /** Returns an idempotent unsubscribe. */
  subscribe(onChange: () => void): () => void;
  /** Replaces the snapshot and notifies subscribers, unless viewsEqual(current, view) (then nothing happens). */
  publish(view: PitchGraphView): void;
}

export function createPitchGraphStore(initial: PitchGraphView = EMPTY_PITCH_GRAPH_VIEW): PitchGraphStore {
  let snapshot = initial;
  // One entry per subscribe call, so the same callback subscribed twice is two subscriptions.
  const listeners = new Set<{ onChange: () => void }>();
  return {
    getSnapshot: () => snapshot,
    subscribe(onChange) {
      const entry = { onChange };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
    publish(view) {
      if (viewsEqual(snapshot, view)) return;
      snapshot = view;
      for (const entry of [...listeners]) entry.onChange();
    },
  };
}
