import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, type FakeGainNode } from '../test/fakeWebAudio';
import { playSequence } from './synth';

const FREQS = [164.81, 440, 440, 466.16, 300];
const D = 0.5; // seconds per note
const START = 10; // ctx.currentTime when playSequence is called
const T0 = START + 0.05; // + SYNTH_START_DELAY_MS
const VOLUME = 0.7;

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
    const playback = playSequence(ctx.asAudioContext(), freqs, { noteDurationMs: D * 1000, volume: VOLUME });
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
    expect(master.gain.value).toBe(VOLUME);
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

  it.each([0, 0.5, 1])('starts the master gain at the volume option (%s), with no scheduled events', (volume) => {
    playSequence(ctx.asAudioContext(), FREQS, { noteDurationMs: 500, volume });
    const master = ctx.gains.find((g) => g.connections.includes(ctx.destination)) as FakeGainNode;
    expect(master.gain.value).toBe(volume);
    expect(master.gain.events).toEqual([]);
  });

  it('applies the per-note envelope 0 → peak 1 (attack) → hold → 0 (release)', () => {
    const { noteGains } = setup();
    noteGains.forEach((g, i) => {
      const ti = T0 + i * D;
      const events = g.gain.events;
      expect(events).toHaveLength(4);
      expect(events[0]).toEqual({ kind: 'set', value: 0, time: expect.closeTo(ti, 9) });
      expect(events[1]).toEqual({ kind: 'ramp', value: 1, time: expect.closeTo(ti + 0.015, 9) });
      expect(events[2]).toEqual({ kind: 'set', value: 1, time: expect.closeTo(ti + D - 0.03, 9) });
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
      { kind: 'set', value: VOLUME, time: START + 1 },
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

  describe('setVolume', () => {
    it('cancels scheduled values and ramps the master gain to the new volume over 20 ms', () => {
      const { playback, master } = setup();
      ctx.currentTime = START + 1;
      playback.setVolume(0.2);
      expect(master.gain.events).toEqual([
        { kind: 'cancel', time: START + 1 },
        { kind: 'set', value: VOLUME, time: START + 1 },
        { kind: 'ramp', value: 0.2, time: expect.closeTo(START + 1.02, 9) },
      ]);
    });

    it('does not change the note envelopes or restart anything', () => {
      const { playback, noteGains } = setup();
      const before = noteGains.map((g) => g.gain.events.length);
      playback.setVolume(0.9);
      expect(noteGains.map((g) => g.gain.events.length)).toEqual(before);
      expect(ctx.oscillators).toHaveLength(FREQS.length);
      expect(ctx.oscillators.every((o) => o.start.mock.calls.length === 1)).toBe(true);
    });

    it('can be called repeatedly, each time from the current time', () => {
      const { playback, master } = setup();
      ctx.currentTime = START + 1;
      playback.setVolume(0.2);
      ctx.currentTime = START + 2;
      playback.setVolume(1);
      expect(master.gain.events.slice(3)).toEqual([
        { kind: 'cancel', time: START + 2 },
        { kind: 'set', value: VOLUME, time: START + 2 },
        { kind: 'ramp', value: 1, time: expect.closeTo(START + 2.02, 9) },
      ]);
    });

    it('is a no-op after stop()', () => {
      const { playback, master } = setup();
      playback.stop();
      const events = master.gain.events.length;
      playback.setVolume(0.2);
      expect(master.gain.events).toHaveLength(events);
    });

    it('is a no-op after the natural end', async () => {
      const { playback, master } = setup();
      ctx.oscillators[4].fireEnded();
      await playback.done;
      playback.setVolume(0.2);
      expect(master.gain.events).toHaveLength(0);
    });

    it('is a no-op after the fallback timer ended the playback', async () => {
      const { playback, master } = setup();
      vi.advanceTimersByTime(50 + FREQS.length * D * 1000 + 200);
      await playback.done;
      playback.setVolume(0.2);
      expect(master.gain.events).toHaveLength(0);
    });
  });

  it('resolves done immediately for an empty sequence', async () => {
    const { playback } = setup([]);
    expect(await isSettled(playback.done)).toBe(true);
  });
});
