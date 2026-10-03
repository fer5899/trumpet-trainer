import { describe, expect, it, vi } from 'vitest';
import { computeLevelDb } from '../audio/level';
import { MicrophoneError } from '../audio/microphone';
import { MIC_FFT_SIZE } from '../config/constants';
import { createFakeAudioServices } from './fakeAudioServices';

describe('createFakeAudioServices', () => {
  it('exposes vi.fn spies', () => {
    const fake = createFakeAudioServices();
    for (const fn of [fake.services.unlock, fake.services.openMicrophone, fake.services.playMelody, fake.services.detectPitch]) {
      expect(vi.isMockFunction(fn)).toBe(true);
    }
  });

  it('opens sessions that track listeners, emit frames and release', async () => {
    const fake = createFakeAudioServices();
    const session = await fake.services.openMicrophone();
    expect(fake.sessions).toHaveLength(1);
    expect(session.sampleRate).toBe(48000);
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    expect(fake.sessions[0].listenerCount).toBe(1);
    const frame = { timeMs: 1, samples: new Float32Array(4) };
    fake.sessions[0].emit(frame);
    expect(listener).toHaveBeenCalledWith(frame);
    unsubscribe();
    unsubscribe();
    expect(fake.sessions[0].listenerCount).toBe(0);
    session.release();
    session.release();
    expect(fake.sessions[0].released).toBe(true);
    expect(session.subscribe(listener)).toBeTypeOf('function');
    expect(fake.sessions[0].listenerCount).toBe(0);
  });

  it('failNextMicrophone rejects only the next open with a MicrophoneError', async () => {
    const fake = createFakeAudioServices();
    fake.failNextMicrophone('permission-denied');
    const error = await fake.services.openMicrophone().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MicrophoneError);
    expect((error as MicrophoneError).kind).toBe('permission-denied');
    expect(fake.sessions).toHaveLength(0);
    await expect(fake.services.openMicrophone()).resolves.toBeDefined();
  });

  it('emitTone sets the detected pitch and emits a frame at the given level', async () => {
    const fake = createFakeAudioServices();
    const session = await fake.services.openMicrophone();
    const frames: { timeMs: number; level: number; pitch: unknown }[] = [];
    session.subscribe(({ timeMs, samples }) => {
      frames.push({ timeMs, level: computeLevelDb(samples), pitch: fake.services.detectPitch(samples, 48000) });
      expect(samples).toHaveLength(MIC_FFT_SIZE);
    });
    fake.emitTone({ hz: 440, levelDb: -20, timeMs: 5 });
    fake.emitTone({ hz: null, levelDb: -50, timeMs: 25 });
    expect(frames[0].timeMs).toBe(5);
    expect(frames[0].level).toBeCloseTo(-20, 5);
    expect(frames[0].pitch).toEqual({ hz: 440, clarity: 1 });
    expect(frames[1].level).toBeCloseTo(-50, 5);
    expect(frames[1].pitch).toBeNull();
  });

  it('records playback calls; finishPlayback resolves the latest done; stop resolves too', async () => {
    const fake = createFakeAudioServices();
    const first = fake.services.playMelody([1, 2], 500);
    const second = fake.services.playMelody([3], 250);
    expect(fake.playCalls).toEqual([
      { frequenciesHz: [1, 2], noteDurationMs: 500 },
      { frequenciesHz: [3], noteDurationMs: 250 },
    ]);
    const onSecond = vi.fn();
    void second.done.then(onSecond);
    fake.finishPlayback();
    await Promise.resolve();
    expect(onSecond).toHaveBeenCalled();
    first.stop();
    expect(fake.stop).toHaveBeenCalledTimes(1);
    await expect(first.done).resolves.toBeUndefined();
  });
});
