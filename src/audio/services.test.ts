import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAudioContext, unlockAudio } from './audioContext';
import { openMicrophone, type MicrophoneSession } from './microphone';
import { detectPitch } from './pitchDetector';
import { createBrowserAudioServices } from './services';
import { playSequence, type Playback } from './synth';

const fakeContext = { id: 'ctx' } as unknown as AudioContext;

vi.mock('./audioContext', () => ({
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

  it('playMelody() plays the sequence on the shared context', () => {
    const playback = { done: Promise.resolve(), stop: vi.fn() } satisfies Playback;
    vi.mocked(playSequence).mockReturnValueOnce(playback);
    const freqs = [440, 466.16];
    expect(createBrowserAudioServices().playMelody(freqs, 500)).toBe(playback);
    expect(playSequence).toHaveBeenCalledWith(fakeContext, freqs, 500);
  });

  it('detectPitch() is the real pitch detector', () => {
    expect(createBrowserAudioServices().detectPitch).toBe(detectPitch);
  });
});
