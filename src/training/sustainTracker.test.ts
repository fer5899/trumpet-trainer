import { describe, expect, it } from 'vitest';
import { createSustainTracker, type PitchFrame } from './sustainTracker';

const TARGET = 69; // concert A4 = 440 Hz
const THRESHOLD = -40;
const STEP_MS = 20;

type FrameOverride = (timeMs: number) => Partial<PitchFrame> | undefined;

/** Pushes frames every 20 ms from t=0 to `untilMs` and returns the times at which push returned true. */
function run(
  untilMs: number,
  base: Omit<PitchFrame, 'timeMs'>,
  override: FrameOverride = () => undefined,
  target = TARGET,
): { results: Map<number, boolean>; firstMatch: number | null } {
  const tracker = createSustainTracker({ thresholdDb: THRESHOLD });
  const results = new Map<number, boolean>();
  let firstMatch: number | null = null;
  for (let t = 0; t <= untilMs; t += STEP_MS) {
    const matched = tracker.push({ timeMs: t, ...base, ...override(t) }, target);
    results.set(t, matched);
    if (matched && firstMatch === null) firstMatch = t;
  }
  return { results, firstMatch };
}

const GOOD = { hz: 440, levelDb: -20 };

describe('createSustainTracker', () => {
  it('matches exactly when the run reaches 500 ms (false up to 480, true at 500)', () => {
    const { results, firstMatch } = run(500, GOOD);
    for (let t = 0; t <= 480; t += STEP_MS) expect(results.get(t)).toBe(false);
    expect(results.get(500)).toBe(true);
    expect(firstMatch).toBe(500);
  });

  it('resets on one drifting frame (446.5 Hz, +25.4 c) at t=260; next run starts at 280, true at 780', () => {
    const { results, firstMatch } = run(800, GOOD, (t) => (t === 260 ? { hz: 446.5 } : undefined));
    expect(results.get(260)).toBe(false);
    expect(results.get(760)).toBe(false);
    expect(results.get(780)).toBe(true);
    expect(firstMatch).toBe(780);
  });

  it('resets on one null-pitch frame', () => {
    const { results, firstMatch } = run(800, GOOD, (t) => (t === 260 ? { hz: null } : undefined));
    expect(results.get(760)).toBe(false);
    expect(firstMatch).toBe(780);
  });

  it('resets on one frame below threshold (−45 dB)', () => {
    const { firstMatch } = run(800, GOOD, (t) => (t === 260 ? { levelDb: -45 } : undefined));
    expect(firstMatch).toBe(780);
  });

  it('treats a level exactly at the threshold as qualifying', () => {
    expect(run(500, { hz: 440, levelDb: THRESHOLD }).firstMatch).toBe(500);
  });

  it.each([220, 880])('never matches the wrong octave (%s Hz)', (hz) => {
    expect(run(2000, { hz, levelDb: -20 }).firstMatch).toBeNull();
  });

  it('never matches a wrong note (a semitone off)', () => {
    expect(run(2000, { hz: 466.16, levelDb: -20 }).firstMatch).toBeNull();
  });

  it('accepts a slightly sharp note (443 Hz, +11.8 c) at t=500', () => {
    expect(run(500, { hz: 443, levelDb: -20 }).firstMatch).toBe(500);
  });

  it('includes the tolerance boundary (exactly 25 cents)', () => {
    const hz = 440 * 2 ** (24.999 / 1200);
    expect(run(500, { hz, levelDb: -20 }).firstMatch).toBe(500);
  });

  it('keeps returning true for further qualifying frames until reset()', () => {
    const tracker = createSustainTracker({ thresholdDb: THRESHOLD });
    for (let t = 0; t < 500; t += STEP_MS) tracker.push({ timeMs: t, ...GOOD }, TARGET);
    expect(tracker.push({ timeMs: 500, ...GOOD }, TARGET)).toBe(true);
    expect(tracker.push({ timeMs: 520, ...GOOD }, TARGET)).toBe(true);
    tracker.reset();
    expect(tracker.push({ timeMs: 540, ...GOOD }, TARGET)).toBe(false);
    expect(tracker.push({ timeMs: 1020, ...GOOD }, TARGET)).toBe(false);
    expect(tracker.push({ timeMs: 1040, ...GOOD }, TARGET)).toBe(true);
  });

  it('resets the run when the target changes', () => {
    // A wide tolerance makes 440 Hz qualify for both 69 and 70, isolating the target-change rule.
    const tracker = createSustainTracker({ thresholdDb: THRESHOLD, toleranceCents: 150 });
    for (let t = 0; t <= 400; t += STEP_MS) tracker.push({ timeMs: t, ...GOOD }, 69);
    expect(tracker.push({ timeMs: 420, ...GOOD }, 70)).toBe(false); // run restarts at 420
    expect(tracker.push({ timeMs: 900, ...GOOD }, 70)).toBe(false);
    expect(tracker.push({ timeMs: 920, ...GOOD }, 70)).toBe(true);
  });

  it('reset() clears the remembered target', () => {
    const tracker = createSustainTracker({ thresholdDb: THRESHOLD });
    tracker.push({ timeMs: 0, ...GOOD }, TARGET);
    tracker.reset();
    expect(tracker.push({ timeMs: 100, ...GOOD }, TARGET)).toBe(false);
    expect(tracker.push({ timeMs: 600, ...GOOD }, TARGET)).toBe(true);
  });

  it('honours custom toleranceCents and requiredMs', () => {
    const tracker = createSustainTracker({ thresholdDb: THRESHOLD, toleranceCents: 5, requiredMs: 100 });
    expect(tracker.push({ timeMs: 0, hz: 443, levelDb: -20 }, TARGET)).toBe(false); // +11.8 c > 5
    expect(tracker.push({ timeMs: 20, ...GOOD }, TARGET)).toBe(false);
    expect(tracker.push({ timeMs: 100, ...GOOD }, TARGET)).toBe(false);
    expect(tracker.push({ timeMs: 120, ...GOOD }, TARGET)).toBe(true);
  });

  it('respects a custom threshold', () => {
    const tracker = createSustainTracker({ thresholdDb: -10 });
    expect(tracker.push({ timeMs: 0, ...GOOD }, TARGET)).toBe(false);
    expect(tracker.push({ timeMs: 600, ...GOOD }, TARGET)).toBe(false);
  });
});
