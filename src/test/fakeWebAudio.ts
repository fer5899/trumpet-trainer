/**
 * Minimal recording fakes of the Web Audio nodes used by the synth adapter.
 * Only what `src/audio/synth.ts` touches is implemented.
 */
import { vi } from 'vitest';

export type ParamEvent =
  | { kind: 'set'; value: number; time: number }
  | { kind: 'ramp'; value: number; time: number }
  | { kind: 'cancel'; time: number };

export class FakeAudioParam {
  value: number;
  events: ParamEvent[] = [];
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'set', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'ramp', value, time });
    return this;
  }
  cancelScheduledValues(time: number): this {
    this.events.push({ kind: 'cancel', time });
    return this;
  }
}

export class FakeNode {
  connections: unknown[] = [];
  disconnected = false;
  connect = vi.fn((target: unknown) => {
    this.connections.push(target);
    return target;
  });
  disconnect = vi.fn(() => {
    this.disconnected = true;
  });
}

export class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam(1);
}

export class FakeBiquadFilterNode extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new FakeAudioParam(350);
  Q = new FakeAudioParam(1);
}

export class FakeOscillatorNode extends FakeNode {
  type: OscillatorType = 'sine';
  frequency = new FakeAudioParam(440);
  startTime: number | null = null;
  stopTimes: number[] = [];
  private endedListeners: Array<() => void> = [];
  start = vi.fn((time = 0) => {
    this.startTime = time;
  });
  stop = vi.fn((time = 0) => {
    this.stopTimes.push(time);
  });
  addEventListener(type: string, listener: () => void): void {
    if (type === 'ended') this.endedListeners.push(listener);
  }
  /** Test control: simulate the browser firing `ended`. */
  fireEnded(): void {
    for (const listener of this.endedListeners) listener();
  }
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state: AudioContextState = 'running';
  destination = new FakeNode();
  oscillators: FakeOscillatorNode[] = [];
  gains: FakeGainNode[] = [];
  filters: FakeBiquadFilterNode[] = [];
  createOscillator(): FakeOscillatorNode {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return node;
  }
  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }
  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node;
  }
  /** Cast helper for passing the fake where a real AudioContext is expected. */
  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}
