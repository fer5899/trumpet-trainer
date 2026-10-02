/** Thin adapter: the one AudioContext shared by the synth and the microphone. */

type AudioContextConstructor = new () => AudioContext;

let sharedContext: AudioContext | null = null;

function resolveConstructor(): AudioContextConstructor {
  const scope = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
  const ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!ctor) throw new Error('Web Audio API is not supported in this browser');
  return ctor;
}

/** Lazily creates the single AudioContext (fallback `webkitAudioContext`) and returns it afterwards. */
export function getAudioContext(): AudioContext {
  if (!sharedContext) {
    const Ctor = resolveConstructor();
    sharedContext = new Ctor();
  }
  return sharedContext;
}

/**
 * Creates/resumes the context. MUST be called synchronously inside a click handler, before any
 * `await`, to satisfy autoplay policies (notably iOS Safari).
 */
export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    // A failed resume is not actionable here; playback will simply stay silent.
    ctx.resume().catch(() => undefined);
  }
}
