import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudioContext {
  static instances = 0;
  state: AudioContextState = 'suspended';
  resume = vi.fn(() => Promise.resolve());
  constructor() {
    FakeAudioContext.instances += 1;
  }
}

async function loadModule() {
  return import('./audioContext');
}

describe('audioContext adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeAudioContext.instances = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lazily creates a single AudioContext and returns it on every call', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const { getAudioContext } = await loadModule();
    expect(FakeAudioContext.instances).toBe(0);
    const first = getAudioContext();
    const second = getAudioContext();
    expect(first).toBeInstanceOf(FakeAudioContext);
    expect(second).toBe(first);
    expect(FakeAudioContext.instances).toBe(1);
  });

  it('falls back to webkitAudioContext', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', FakeAudioContext);
    const { getAudioContext } = await loadModule();
    expect(getAudioContext()).toBeInstanceOf(FakeAudioContext);
  });

  it('unlockAudio resumes a suspended context synchronously', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const { getAudioContext, unlockAudio } = await loadModule();
    unlockAudio();
    const ctx = getAudioContext() as unknown as FakeAudioContext;
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.instances).toBe(1);
  });

  it('unlockAudio does not resume a running context', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const { getAudioContext, unlockAudio } = await loadModule();
    const ctx = getAudioContext() as unknown as FakeAudioContext;
    ctx.state = 'running';
    unlockAudio();
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('unlockAudio swallows a rejected resume()', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const { getAudioContext, unlockAudio } = await loadModule();
    const ctx = getAudioContext() as unknown as FakeAudioContext;
    ctx.resume.mockImplementationOnce(() => Promise.reject(new Error('nope')));
    expect(() => unlockAudio()).not.toThrow();
    await Promise.resolve();
  });
});
