import { PitchDetector } from 'pitchy';
import { MAX_DETECT_HZ, MIN_CLARITY, MIN_DETECT_HZ } from '../config/constants';

export interface PitchResult {
  hz: number;
  clarity: number;
}

/** pitchy detectors hold internal FFT buffers sized to the input, so cache one per length. */
const detectors = new Map<number, PitchDetector<Float32Array>>();

function detectorFor(length: number): PitchDetector<Float32Array> {
  let detector = detectors.get(length);
  if (!detector) {
    detector = PitchDetector.forFloat32Array(length);
    detectors.set(length, detector);
  }
  return detector;
}

/**
 * Monophonic pitch (McLeod Pitch Method via pitchy). Returns null unless the pitch is finite,
 * within [MIN_DETECT_HZ, MAX_DETECT_HZ] and at least MIN_CLARITY clear. No level gating here.
 */
export function detectPitch(samples: Float32Array, sampleRate: number): PitchResult | null {
  if (samples.length === 0) return null;
  const [hz, clarity] = detectorFor(samples.length).findPitch(samples, sampleRate);
  if (!Number.isFinite(hz) || hz <= 0) return null;
  if (hz < MIN_DETECT_HZ || hz > MAX_DETECT_HZ) return null;
  if (!(clarity >= MIN_CLARITY)) return null;
  return { hz, clarity };
}
