/** Synthetic test signals for audio unit tests (no Web Audio needed). */

export function sine(hz: number, sampleRate: number, length: number, amplitude = 1): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  }
  return out;
}

/** Naive (non band-limited) sawtooth in [-amplitude, amplitude). */
export function sawtooth(hz: number, sampleRate: number, length: number, amplitude = 1): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const phase = (hz * i) / sampleRate;
    out[i] = amplitude * (2 * (phase - Math.floor(phase)) - 1);
  }
  return out;
}

/** Deterministic PRNG (mulberry32) returning values in [0, 1). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function whiteNoise(length: number, seed: number, amplitude = 1): Float32Array {
  const rng = seededRng(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = amplitude * (2 * rng() - 1);
  }
  return out;
}

export function constant(value: number, length: number): Float32Array {
  return new Float32Array(length).fill(value);
}
