import { describe, expect, it } from 'vitest';
import type { ConcertMidi } from '../music/notes';
import { createHoldTracker, type HoldStatus, type HoldTrackerOptions } from './holdTracker';

const STEP_MS = 20;

type MidiAt = (timeMs: number) => number | null;

/** Pushes frames every 20 ms from t = 0 to `untilMs`; returns the status per time and the first completion. */
function run(
  untilMs: number,
  midiAt: MidiAt,
  wrongNotes: readonly ConcertMidi[] = [],
  options?: HoldTrackerOptions,
): { status: Map<number, HoldStatus>; firstCompleted: { timeMs: number; note: number } | null } {
  const tracker = createHoldTracker(options);
  const status = new Map<number, HoldStatus>();
  let firstCompleted: { timeMs: number; note: number } | null = null;
  for (let t = 0; t <= untilMs; t += STEP_MS) {
    const s = tracker.push({ timeMs: t, midi: midiAt(t) }, wrongNotes);
    status.set(t, s);
    if (s.completed !== null && firstCompleted === null) firstCompleted = { timeMs: t, note: s.completed };
  }
  return { status, firstCompleted };
}

const constant = (m: number | null): MidiAt => () => m;

describe('createHoldTracker (ported sustain cases)', () => {
  it('completes a constant 69 exactly at t 500, with progress = elapsed / 500', () => {
    const { status, firstCompleted } = run(500, constant(69));
    expect(status.get(0)).toEqual({ note: 69, progress: 0, completed: null });
    expect(status.get(240)?.progress).toBeCloseTo(0.48, 10);
    expect(status.get(260)?.progress).toBeCloseTo(0.52, 10);
    for (let t = 0; t <= 480; t += STEP_MS) expect(status.get(t)?.completed).toBeNull();
    expect(status.get(500)).toEqual({ note: 69, progress: 1, completed: 69 });
    expect(firstCompleted).toEqual({ timeMs: 500, note: 69 });
  });

  it('resets on one frame at +25.4 c (t 260); the run restarts at 280 and completes at 780', () => {
    const { status, firstCompleted } = run(800, (t) => (t === 260 ? 69.254 : 69));
    expect(status.get(260)).toEqual({ note: 69, progress: 0, completed: null });
    expect(status.get(280)?.progress).toBe(0);
    expect(status.get(760)?.completed).toBeNull();
    expect(status.get(780)?.completed).toBe(69);
    expect(firstCompleted?.timeMs).toBe(780);
  });

  it('resets on one null frame', () => {
    const { status, firstCompleted } = run(800, (t) => (t === 260 ? null : 69));
    expect(status.get(260)).toEqual({ note: null, progress: 0, completed: null });
    expect(firstCompleted?.timeMs).toBe(780);
  });

  it.each([57, 81])('completes any note, e.g. the octave %s, at t 500', (m) => {
    expect(run(500, constant(m)).firstCompleted).toEqual({ timeMs: 500, note: m });
  });

  it('completes a semitone off (70) at t 500', () => {
    expect(run(500, constant(70)).firstCompleted).toEqual({ timeMs: 500, note: 70 });
  });

  it('completes a slightly sharp 69.1176 (+11.8 c) as 69 at t 500', () => {
    expect(run(500, constant(69.1176)).firstCompleted).toEqual({ timeMs: 500, note: 69 });
  });

  it('includes the tolerance boundary (exactly +12.5 c); 69.1251 never fills', () => {
    expect(run(500, constant(69.125)).firstCompleted).toEqual({ timeMs: 500, note: 69 });
    const outside = run(2000, constant(69.1251));
    expect(outside.firstCompleted).toBeNull();
    for (const s of outside.status.values()) expect(s.progress).toBe(0);
  });

  it('completes once per run; reset() starts a new run', () => {
    const tracker = createHoldTracker();
    for (let t = 0; t < 500; t += STEP_MS) tracker.push({ timeMs: t, midi: 69 }, []);
    expect(tracker.push({ timeMs: 500, midi: 69 }, []).completed).toBe(69);
    expect(tracker.push({ timeMs: 520, midi: 69 }, [])).toEqual({ note: 69, progress: 1, completed: null });
    tracker.reset();
    expect(tracker.push({ timeMs: 540, midi: 69 }, []).progress).toBe(0);
    expect(tracker.push({ timeMs: 1020, midi: 69 }, []).completed).toBeNull();
    expect(tracker.push({ timeMs: 1040, midi: 69 }, []).completed).toBe(69);
  });

  it('reset() ends the run', () => {
    const tracker = createHoldTracker();
    tracker.push({ timeMs: 0, midi: 69 }, []);
    tracker.reset();
    expect(tracker.push({ timeMs: 100, midi: 69 }, []).progress).toBe(0);
    expect(tracker.push({ timeMs: 580, midi: 69 }, []).completed).toBeNull();
    expect(tracker.push({ timeMs: 600, midi: 69 }, []).completed).toBe(69);
  });

  it('honours custom toleranceCents and requiredMs', () => {
    const tracker = createHoldTracker({ toleranceCents: 5, requiredMs: 100 });
    expect(tracker.push({ timeMs: 0, midi: 69.118 }, [])).toEqual({ note: 69, progress: 0, completed: null });
    expect(tracker.push({ timeMs: 20, midi: 69 }, []).completed).toBeNull();
    expect(tracker.push({ timeMs: 100, midi: 69 }, []).completed).toBeNull();
    expect(tracker.push({ timeMs: 120, midi: 69 }, []).completed).toBe(69);
  });
});

describe('createHoldTracker (nearest note, wrong notes)', () => {
  it('restarts the run when the nearest note changes', () => {
    const { status, firstCompleted } = run(920, (t) => (t <= 400 ? 69.4 : 69.6), [], { toleranceCents: 50 });
    expect(status.get(400)).toEqual({ note: 69, progress: 0.8, completed: null });
    expect(status.get(420)).toEqual({ note: 70, progress: 0, completed: null });
    expect(status.get(900)?.completed).toBeNull();
    expect(firstCompleted).toEqual({ timeMs: 920, note: 70 });
  });

  it('assigns the tie 69.5 to 70 (outside ±25 c; a run of 70 with toleranceCents 50)', () => {
    expect(createHoldTracker().push({ timeMs: 0, midi: 69.5 }, [])).toEqual({ note: 70, progress: 0, completed: null });
    const wide = run(500, constant(69.5), [], { toleranceCents: 50 });
    expect(wide.status.get(20)?.progress).toBeCloseTo(0.04, 10);
    expect(wide.firstCompleted).toEqual({ timeMs: 500, note: 70 });
  });

  it('a wrong note never fills or completes; another note with the same list completes', () => {
    const wrong = run(2000, constant(69), [69]);
    expect(wrong.firstCompleted).toBeNull();
    for (const s of wrong.status.values()) expect(s).toEqual({ note: 69, progress: 0, completed: null });
    expect(run(500, constant(70), [69]).firstCompleted).toEqual({ timeMs: 500, note: 70 });
  });

  it('a run is broken when its note becomes wrong; a fresh run starts once it is not', () => {
    const tracker = createHoldTracker();
    for (let t = 0; t <= 300; t += STEP_MS) tracker.push({ timeMs: t, midi: 70 }, []);
    expect(tracker.push({ timeMs: 320, midi: 70 }, [70])).toEqual({ note: 70, progress: 0, completed: null });
    expect(tracker.push({ timeMs: 340, midi: 70 }, []).progress).toBe(0);
    expect(tracker.push({ timeMs: 820, midi: 70 }, []).completed).toBeNull();
    expect(tracker.push({ timeMs: 840, midi: 70 }, []).completed).toBe(70);
  });
});
