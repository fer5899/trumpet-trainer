import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, type FakeGainNode } from '../test/fakeWebAudio';
import { playSequence } from './synth';

const FREQS = [164.81, 440, 440, 466.16, 300];
const D = 0.5; // seconds per note
const START = 10; // ctx.currentTime when playSequence is called
const T0 = START + 0.05; // + SYNTH_START_DELAY_MS

async function isSettled(promise: Promise<void>): Promise<boolean> {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  return settled;
}

describe('playSequence', () => {
  let ctx: FakeAudioContext;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = new FakeAudioContext();
    ctx.currentTime = START;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(freqs = FREQS) {
    const playback = playSequence(ctx.asAudioContext(), freqs, D * 1000);
    const [filter] = ctx.filters;
    // one gain per note + the master gain, which is the one connected to the destination
    const master = ctx.gains.find((g) => g.connections.includes(ctx.destination)) as FakeGainNode;
    const noteGains = ctx.gains.filter((g) => g !== master);
    return { playback, filter, master, noteGains };
  }

  it('creates one sawtooth oscillator per note with the given frequency', () => {
    setup();
    expect(ctx.oscillators).toHaveLength(FREQS.length);
    ctx.oscillators.forEach((osc, i) => {
      expect(osc.type).toBe('sawtooth');
      expect(osc.frequency.value).toBe(FREQS[i]);
    });
  });

  it('wires oscillator → note gain → shared low-pass → master gain → destination', () => {
    const { filter, master, noteGains } = setup();
    expect(ctx.filters).toHaveLength(1);
    expect(filter.type).toBe('lowpass');
    expect(filter.frequency.value).toBe(2000);
    expect(filter.Q.value).toBe(0.7);
    expect(master.gain.value).toBe(1);
    expect(master.connections).toEqual([ctx.destination]);
    expect(filter.connections).toEqual([master]);
    expect(noteGains).toHaveLength(FREQS.length);
    ctx.oscillators.forEach((osc, i) => {
      expect(osc.connections).toEqual([noteGains[i]]);
      expect(noteGains[i].connections).toEqual([filter]);
    });
  });

  it('schedules the notes back to back after the start delay, without gaps', () => {
    setup();
    ctx.oscillators.forEach((osc, i) => {
      expect(osc.startTime).toBeCloseTo(T0 + i * D, 9);
      expect(osc.stopTimes[0]).toBeCloseTo(T0 + (i + 1) * D, 9);
    });
  });

  it('applies the per-note envelope 0 → peak (attack) → hold → 0 (release)', () => {
    const { noteGains } = setup();
    noteGains.forEach((g, i) => {
      const ti = T0 + i * D;
      const events = g.gain.events;
      expect(events).toHaveLength(4);
      expect(events[0]).toEqual({ kind: 'set', value: 0, time: expect.closeTo(ti, 9) });
      expect(events[1]).toEqual({ kind: 'ramp', value: 0.25, time: expect.closeTo(ti + 0.015, 9) });
      expect(events[2]).toEqual({ kind: 'set', value: 0.25, time: expect.closeTo(ti + D - 0.03, 9) });
      expect(events[3]).toEqual({ kind: 'ramp', value: 0, time: expect.closeTo(ti + D, 9) });
    });
  });

  it('resolves done when the last oscillator fires ended (not earlier ones)', async () => {
    const { playback } = setup();
    ctx.oscillators[0].fireEnded();
    ctx.oscillators[3].fireEnded();
    expect(await isSettled(playback.done)).toBe(false);
    ctx.oscillators[4].fireEnded();
    expect(await isSettled(playback.done)).toBe(true);
  });

  it('falls back to a timer of start delay + total duration + 200 ms if ended never fires', async () => {
    const { playback } = setup();
    const totalMs = 50 + FREQS.length * D * 1000 + 200;
    vi.advanceTimersByTime(totalMs - 1);
    expect(await isSettled(playback.done)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(await isSettled(playback.done)).toBe(true);
  });

  it('disconnects the graph after finishing naturally', async () => {
    const { playback, filter, master } = setup();
    ctx.oscillators[4].fireEnded();
    await playback.done;
    expect(ctx.oscillators.every((o) => o.disconnected)).toBe(true);
    expect(filter.disconnected).toBe(true);
    expect(master.disconnected).toBe(true);
  });

  it('stop() fades the master gain over 20 ms, stops and disconnects the oscillators and resolves done', async () => {
    const { playback, master } = setup();
    ctx.currentTime = START + 1;
    playback.stop();
    expect(master.gain.events).toEqual([
      { kind: 'cancel', time: START + 1 },
      { kind: 'set', value: 1, time: START + 1 },
      { kind: 'ramp', value: 0, time: expect.closeTo(START + 1.02, 9) },
    ]);
    for (const osc of ctx.oscillators) {
      expect(osc.stopTimes.at(-1)).toBeCloseTo(START + 1.02, 9);
    }
    expect(await isSettled(playback.done)).toBe(true);
    vi.advanceTimersByTime(20);
    expect(ctx.oscillators.every((o) => o.disconnected)).toBe(true);
  });

  it('stop() is idempotent', async () => {
    const { playback, master } = setup();
    playback.stop();
    const eventsAfterFirst = master.gain.events.length;
    const stopCalls = ctx.oscillators.map((o) => o.stop.mock.calls.length);
    expect(() => playback.stop()).not.toThrow();
    expect(master.gain.events).toHaveLength(eventsAfterFirst);
    expect(ctx.oscillators.map((o) => o.stop.mock.calls.length)).toEqual(stopCalls);
    await expect(playback.done).resolves.toBeUndefined();
  });

  it('stop() after natural completion does nothing', async () => {
    const { playback, master } = setup();
    ctx.oscillators[4].fireEnded();
    await playback.done;
    playback.stop();
    expect(master.gain.events).toHaveLength(0);
  });

  it('tolerates oscillators that throw on stop()', () => {
    const { playback } = setup();
    ctx.oscillators[0].stop.mockImplementation(() => {
      throw new DOMException('already stopped', 'InvalidStateError');
    });
    expect(() => playback.stop()).not.toThrow();
  });

  it('resolves done immediately for an empty sequence', async () => {
    const { playback } = setup([]);
    expect(await isSettled(playback.done)).toBe(true);
  });
});
