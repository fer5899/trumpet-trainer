import { act, fireEvent, render, screen } from '@testing-library/react';
import { Profiler, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AudioServicesProvider } from '../audio/AudioServicesContext';
import type { MicrophoneErrorKind, MicrophoneSession } from '../audio/microphone';
import { createFakeAudioServices, type FakeAudioServices } from '../test/fakeAudioServices';
import { MicLevelMeter } from './MicLevelMeter';

function Harness({ fake, onThresholdChange }: { fake: FakeAudioServices; onThresholdChange?: (db: number) => void }) {
  const [active, setActive] = useState(false);
  const [threshold, setThreshold] = useState(-40);
  const [error, setError] = useState<MicrophoneErrorKind | null>(null);
  return (
    <AudioServicesProvider services={fake.services}>
      <MicLevelMeter
        active={active}
        onActiveChange={setActive}
        error={error}
        onErrorChange={setError}
        thresholdDb={threshold}
        onThresholdChange={(db) => {
          onThresholdChange?.(db);
          setThreshold(db);
        }}
      />
    </AudioServicesProvider>
  );
}

const toggle = () => screen.getByRole('button', { name: 'Test microphone' });
const meter = () => screen.getByRole('meter', { name: 'Microphone level' });
const fill = () => screen.getByTestId('mic-level-fill');

describe('MicLevelMeter', () => {
  it('fill width follows the clamped level and uses the ok colour at or above the threshold', async () => {
    const fake = createFakeAudioServices();
    render(<Harness fake={fake} />);
    expect(fill().style.width).toBe('0%');
    await act(async () => fireEvent.click(toggle()));

    act(() => fake.emitTone({ hz: null, levelDb: -30, timeMs: 0 }));
    expect(parseFloat(fill().style.width)).toBeCloseTo(50, 3);
    expect(fill()).toHaveClass('mic-meter__fill--ok');

    act(() => fake.emitTone({ hz: null, levelDb: -45, timeMs: 20 }));
    expect(parseFloat(fill().style.width)).toBeCloseTo(25, 3);
    expect(fill()).not.toHaveClass('mic-meter__fill--ok');
    expect(meter()).toHaveAttribute('aria-valuenow', '-45');

    act(() => fake.emitTone({ hz: null, levelDb: 0, timeMs: 40 }));
    expect(parseFloat(fill().style.width)).toBeCloseTo(100, 3);
    expect(meter()).toHaveAttribute('aria-valuenow', '0');
  });

  it('slider changes call onThresholdChange with a number and move the marker label', () => {
    const fake = createFakeAudioServices();
    const onThresholdChange = vi.fn();
    render(<Harness fake={fake} onThresholdChange={onThresholdChange} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Threshold' }), { target: { value: '-12' } });
    expect(onThresholdChange).toHaveBeenCalledWith(-12);
    expect(screen.getByText('Threshold: −12 dB')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: 'Threshold' }), { target: { value: '0' } });
    expect(screen.getByText('Threshold: 0 dB')).toBeInTheDocument();
  });

  it('an open that resolves after the test was turned off is released immediately', async () => {
    const fake = createFakeAudioServices();
    let resolveOpen!: (session: MicrophoneSession) => void;
    fake.services.openMicrophone.mockImplementationOnce(
      () => new Promise<MicrophoneSession>((resolve) => (resolveOpen = resolve)),
    );
    render(<Harness fake={fake} />);
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');

    const late = { sampleRate: 48000, subscribe: vi.fn(() => () => undefined), release: vi.fn() };
    await act(async () => resolveOpen(late));
    expect(late.release).toHaveBeenCalledTimes(1);
    expect(late.subscribe).not.toHaveBeenCalled();
  });

  it('unmounting while active unsubscribes and releases', async () => {
    const fake = createFakeAudioServices();
    const { unmount } = render(<Harness fake={fake} />);
    await act(async () => fireEvent.click(toggle()));
    expect(fake.sessions[0].listenerCount).toBe(1);
    unmount();
    expect(fake.sessions[0].listenerCount).toBe(0);
    expect(fake.sessions[0].released).toBe(true);
  });

  it('turning the test on again clears a previous error', async () => {
    const fake = createFakeAudioServices();
    fake.failNextMicrophone('unknown');
    render(<Harness fake={fake} />);
    await act(async () => fireEvent.click(toggle()));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await act(async () => fireEvent.click(toggle()));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
  });

  it('re-renders only when the displayed (rounded, clamped) level changes', async () => {
    const fake = createFakeAudioServices();
    const onRender = vi.fn();
    render(
      <Profiler id="meter" onRender={onRender}>
        <Harness fake={fake} />
      </Profiler>,
    );
    await act(async () => fireEvent.click(toggle()));
    act(() => fake.emitTone({ hz: null, levelDb: -30.1, timeMs: 0 }));
    expect(meter()).toHaveAttribute('aria-valuenow', '-30');
    const commits = onRender.mock.calls.length;

    act(() => fake.emitTone({ hz: null, levelDb: -30.2, timeMs: 20 }));
    act(() => fake.emitTone({ hz: null, levelDb: -29.9, timeMs: 40 }));
    expect(onRender).toHaveBeenCalledTimes(commits);

    act(() => fake.emitTone({ hz: null, levelDb: -95, timeMs: 60 }));
    expect(onRender).toHaveBeenCalledTimes(commits + 1);
    act(() => fake.emitTone({ hz: null, levelDb: -100, timeMs: 80 }));
    expect(onRender).toHaveBeenCalledTimes(commits + 1);
    expect(meter()).toHaveAttribute('aria-valuenow', '-60');
  });
});
