import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeNode } from '../test/fakeWebAudio';
import { MicrophoneError, openMicrophone, type MicFrame } from './microphone';

class FakeAnalyserNode extends FakeNode {
  fftSize = 32;
  fillValue = 0.25;
  getFloatTimeDomainData = vi.fn((buffer: Float32Array) => {
    buffer.fill(this.fillValue);
  });
}

class FakeMicContext {
  sampleRate = 44100;
  destination = new FakeNode();
  sources: Array<FakeNode & { stream: MediaStream }> = [];
  analysers: FakeAnalyserNode[] = [];
  createMediaStreamSource(stream: MediaStream) {
    const node = Object.assign(new FakeNode(), { stream });
    this.sources.push(node);
    return node;
  }
  createAnalyser() {
    const node = new FakeAnalyserNode();
    this.analysers.push(node);
    return node;
  }
  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}

function fakeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  return { tracks, stream: { getTracks: () => tracks } as unknown as MediaStream };
}

/** Controllable requestAnimationFrame. */
function installRaf() {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const raf = vi.fn((cb: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });
  const cancel = vi.fn((id: number) => {
    pending.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  return {
    raf,
    cancel,
    get pendingCount() {
      return pending.size;
    },
    /** Runs every callback queued so far (callbacks may queue the next frame). */
    tick(time = 0) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb(time);
    },
  };
}

function stubGetUserMedia(impl: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  const getUserMedia = vi.fn(impl);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  return getUserMedia;
}

describe('openMicrophone', () => {
  let ctx: FakeMicContext;
  let raf: ReturnType<typeof installRaf>;

  beforeEach(() => {
    ctx = new FakeMicContext();
    raf = installRaf();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('errors', () => {
    it('rejects with "unsupported" when navigator.mediaDevices is missing', async () => {
      vi.stubGlobal('navigator', {});
      const error = await openMicrophone(ctx.asAudioContext()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(MicrophoneError);
      expect((error as MicrophoneError).kind).toBe('unsupported');
    });

    it('rejects with "unsupported" when getUserMedia is missing', async () => {
      vi.stubGlobal('navigator', { mediaDevices: {} });
      await expect(openMicrophone(ctx.asAudioContext())).rejects.toMatchObject({ kind: 'unsupported' });
    });

    it.each([
      ['NotAllowedError', 'permission-denied'],
      ['SecurityError', 'permission-denied'],
      ['NotFoundError', 'unknown'],
      ['NotReadableError', 'unknown'],
      ['AbortError', 'unknown'],
    ])('maps %s to "%s" and keeps the cause', async (name, kind) => {
      const cause = new DOMException('boom', name);
      stubGetUserMedia(() => Promise.reject(cause));
      const error = (await openMicrophone(ctx.asAudioContext()).catch((e: unknown) => e)) as MicrophoneError;
      expect(error).toBeInstanceOf(MicrophoneError);
      expect(error).toBeInstanceOf(Error);
      expect(error.kind).toBe(kind);
      expect(error.cause).toBe(cause);
    });

    it('maps a non-Error rejection to "unknown"', async () => {
      stubGetUserMedia(() => Promise.reject('weird'));
      await expect(openMicrophone(ctx.asAudioContext())).rejects.toMatchObject({ kind: 'unknown' });
    });

    it('maps an error thrown synchronously by getUserMedia to "unknown"', async () => {
      stubGetUserMedia(() => {
        throw new TypeError('sync');
      });
      await expect(openMicrophone(ctx.asAudioContext())).rejects.toMatchObject({ kind: 'unknown' });
    });
  });

  it('stops the tracks and rejects with "unknown" if building the audio graph fails', async () => {
    const { stream, tracks } = fakeStream();
    stubGetUserMedia(() => Promise.resolve(stream));
    const failure = new Error('graph');
    ctx.createAnalyser = () => {
      throw failure;
    };
    await expect(openMicrophone(ctx.asAudioContext())).rejects.toMatchObject({ kind: 'unknown', cause: failure });
    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
  });

  describe('session', () => {
    async function open() {
      const { stream, tracks } = fakeStream();
      const getUserMedia = stubGetUserMedia(() => Promise.resolve(stream));
      const session = await openMicrophone(ctx.asAudioContext());
      return { session, stream, tracks, getUserMedia };
    }

    it('requests raw audio: echo cancellation, noise suppression and AGC disabled', async () => {
      const { getUserMedia } = await open();
      expect(getUserMedia).toHaveBeenCalledWith({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    });

    it('connects source → analyser with fftSize ≥ 2048 and never to the destination', async () => {
      const { stream } = await open();
      const [source] = ctx.sources;
      const [analyser] = ctx.analysers;
      expect(source.stream).toBe(stream);
      expect(analyser.fftSize).toBe(2048);
      expect(source.connections).toEqual([analyser]);
      expect(analyser.connections).toEqual([]);
      expect(ctx.destination.connect).not.toHaveBeenCalled();
    });

    it('exposes the context sample rate', async () => {
      const { session } = await open();
      expect(session.sampleRate).toBe(44100);
    });

    it('does not run the frame loop without listeners', async () => {
      await open();
      expect(raf.pendingCount).toBe(0);
      expect(ctx.analysers[0].getFloatTimeDomainData).not.toHaveBeenCalled();
    });

    it('emits frames with performance.now() and a reused fftSize-long buffer to every listener', async () => {
      const { session } = await open();
      const now = vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1016);
      // The frame object is reused, so read it synchronously (as real listeners must).
      const seenByA: Array<{ frame: MicFrame; timeMs: number }> = [];
      const a = vi.fn((frame: MicFrame) => seenByA.push({ frame, timeMs: frame.timeMs }));
      const b = vi.fn();
      session.subscribe(a);
      session.subscribe(b);
      raf.tick();
      raf.tick();
      expect(a).toHaveBeenCalledTimes(2);
      expect(b).toHaveBeenCalledTimes(2);
      const [first, second] = seenByA;
      expect(first.timeMs).toBe(1000);
      expect(second.timeMs).toBe(1016);
      expect(first.frame.samples).toBeInstanceOf(Float32Array);
      expect(first.frame.samples).toHaveLength(2048);
      expect(first.frame.samples[0]).toBeCloseTo(0.25);
      expect(second.frame.samples).toBe(first.frame.samples);
      expect(b.mock.calls[0][0]).toBe(first.frame);
      now.mockRestore();
    });

    it('reuses one frame object across frames (no per-frame allocation)', async () => {
      const { session } = await open();
      const listener = vi.fn();
      session.subscribe(listener);
      raf.tick();
      raf.tick();
      expect(listener.mock.calls[1][0]).toBe(listener.mock.calls[0][0]);
    });

    it('a listener subscribed or unsubscribed during a frame takes effect from the next frame', async () => {
      const { session } = await open();
      const late = vi.fn();
      const b = vi.fn();
      let unsubscribeB: () => void = () => undefined;
      const a = vi.fn(() => {
        session.subscribe(late);
        unsubscribeB();
      });
      session.subscribe(a);
      unsubscribeB = session.subscribe(b);
      raf.tick();
      expect(late).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledTimes(1);
      raf.tick();
      expect(late).toHaveBeenCalled();
      expect(b).toHaveBeenCalledTimes(1);
    });

    it('keeps the frame loop running when a listener throws', async () => {
      const { session } = await open();
      const failure = new Error('listener bug');
      const bad = vi.fn((): void => {
        throw failure;
      });
      const good = vi.fn();
      session.subscribe(bad);
      session.subscribe(good);
      expect(() => raf.tick()).toThrow(failure);
      expect(raf.pendingCount).toBe(1);
      bad.mockImplementation(() => undefined);
      raf.tick();
      expect(good).toHaveBeenCalledTimes(1);
      expect(bad).toHaveBeenCalledTimes(2);
      expect(raf.pendingCount).toBe(1);
    });

    it('stops emitting to an unsubscribed listener and stops the loop when none are left', async () => {
      const { session } = await open();
      const a = vi.fn();
      const b = vi.fn();
      const unsubscribeA = session.subscribe(a);
      const unsubscribeB = session.subscribe(b);
      raf.tick();
      unsubscribeA();
      raf.tick();
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(2);
      unsubscribeB();
      unsubscribeB(); // idempotent
      expect(raf.pendingCount).toBe(0);
      raf.tick();
      expect(b).toHaveBeenCalledTimes(2);
    });

    it('release() cancels the frame loop, stops tracks, disconnects nodes and drops listeners', async () => {
      const { session, tracks } = await open();
      const listener = vi.fn();
      session.subscribe(listener);
      session.release();
      expect(raf.cancel).toHaveBeenCalled();
      expect(raf.pendingCount).toBe(0);
      for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
      expect(ctx.sources[0].disconnected).toBe(true);
      expect(ctx.analysers[0].disconnected).toBe(true);
      raf.tick();
      expect(listener).not.toHaveBeenCalled();
    });

    it('release() is idempotent and subscribing afterwards is a no-op', async () => {
      const { session, tracks } = await open();
      session.release();
      session.release();
      for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
      const listener = vi.fn();
      const unsubscribe = session.subscribe(listener);
      expect(raf.pendingCount).toBe(0);
      expect(() => unsubscribe()).not.toThrow();
    });
  });
});

describe('MicrophoneError', () => {
  it('carries its kind and a descriptive name', () => {
    const error = new MicrophoneError('permission-denied');
    expect(error.kind).toBe('permission-denied');
    expect(error.name).toBe('MicrophoneError');
    expect(error.message).toContain('permission-denied');
  });
});
