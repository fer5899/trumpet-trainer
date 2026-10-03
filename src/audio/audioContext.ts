/** Thin adapter: the one AudioContext shared by the synth and the microphone. */

type AudioContextConstructor = new () => AudioContext;

/** Thrown by `getAudioContext()` when the browser has neither `AudioContext` nor `webkitAudioContext`. */
export class WebAudioUnsupportedError extends Error {
  constructor() {
    super('Web Audio API is not supported in this browser');
    this.name = 'WebAudioUnsupportedError';
  }
}

let sharedContext: AudioContext | null = null;

function resolveConstructor(): AudioContextConstructor | undefined {
  const scope = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

/**
 * Lazily creates the single AudioContext (fallback `webkitAudioContext`) and returns it afterwards.
 * Throws `WebAudioUnsupportedError` when Web Audio is unavailable.
 */
export function getAudioContext(): AudioContext {
  if (!sharedContext) {
    const Ctor = resolveConstructor();
    if (!Ctor) throw new WebAudioUnsupportedError();
    sharedContext = new Ctor();
  }
  return sharedContext;
}

/**
 * Creates/resumes the context. MUST be called synchronously inside a click handler, before any
 * `await`, to satisfy autoplay policies (notably iOS Safari). A no-op without Web Audio support:
 * the following `openMicrophone()` then rejects with an "unsupported" `MicrophoneError`.
 */
export function unlockAudio(): void {
  if (!sharedContext && !resolveConstructor()) return;
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    // A failed resume is not actionable here; playback will simply stay silent.
    ctx.resume().catch(() => undefined);
  }
}
