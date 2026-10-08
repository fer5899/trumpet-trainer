import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAudioContext, unlockAudio, WebAudioUnsupportedError } from './audioContext';
import { MicrophoneError, openMicrophone, type MicrophoneSession } from './microphone';
import { detectPitch } from './pitchDetector';
import { createBrowserAudioServices } from './services';
import { playSequence, type Playback } from './synth';

const fakeContext = { id: 'ctx' } as unknown as AudioContext;

vi.mock('./audioContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./audioContext')>()),
  getAudioContext: vi.fn(() => fakeContext),
  unlockAudio: vi.fn(),
}));
vi.mock('./microphone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./microphone')>()),
  openMicrophone: vi.fn(),
}));
vi.mock('./synth', () => ({ playSequence: vi.fn() }));

describe('createBrowserAudioServices', () => {
  beforeEach(() => {
    vi.mocked(getAudioContext).mockClear();
    vi.mocked(unlockAudio).mockClear();
    vi.mocked(openMicrophone).mockClear();
  });

  it('does not create the AudioContext eagerly (it must be created in a click handler)', () => {
    createBrowserAudioServices();
    expect(getAudioContext).not.toHaveBeenCalled();
  });

  it('unlock() delegates to unlockAudio synchronously', () => {
    createBrowserAudioServices().unlock();
    expect(unlockAudio).toHaveBeenCalledTimes(1);
  });

  it('openMicrophone() opens the mic on the shared context', async () => {
    const session = { sampleRate: 48000 } as MicrophoneSession;
    vi.mocked(openMicrophone).mockResolvedValueOnce(session);
    await expect(createBrowserAudioServices().openMicrophone()).resolves.toBe(session);
    expect(openMicrophone).toHaveBeenCalledWith(fakeContext);
  });

  it('openMicrophone() rejects (never throws synchronously) with "unsupported" when Web Audio is missing', async () => {
    const cause = new WebAudioUnsupportedError();
    vi.mocked(getAudioContext).mockImplementationOnce(() => {
      throw cause;
    });
    let result!: Promise<MicrophoneSession>;
    expect(() => (result = createBrowserAudioServices().openMicrophone())).not.toThrow();
    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MicrophoneError);
    expect(error).toMatchObject({ kind: 'unsupported', cause });
    expect(openMicrophone).not.toHaveBeenCalled();
  });

  it('openMicrophone() rejects with "unknown" when creating the AudioContext fails otherwise', async () => {
    const cause = new Error('too many contexts');
    vi.mocked(getAudioContext).mockImplementationOnce(() => {
      throw cause;
    });
    await expect(createBrowserAudioServices().openMicrophone()).rejects.toMatchObject({ kind: 'unknown', cause });
  });

  it('playMelody() plays the sequence on the shared context, forwarding the options', () => {
    const playback = { done: Promise.resolve(), stop: vi.fn(), setVolume: vi.fn() } satisfies Playback;
    vi.mocked(playSequence).mockReturnValueOnce(playback);
    const freqs = [440, 466.16];
    const options = { noteDurationMs: 500, volume: 0.5 };
    expect(createBrowserAudioServices().playMelody(freqs, options)).toBe(playback);
    expect(playSequence).toHaveBeenCalledWith(fakeContext, freqs, options);
  });

  it('detectPitch() is the real pitch detector', () => {
    expect(createBrowserAudioServices().detectPitch).toBe(detectPitch);
  });
});
