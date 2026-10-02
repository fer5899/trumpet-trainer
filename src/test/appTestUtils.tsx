import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AudioServicesProvider } from '../audio/AudioServicesContext';
import { LISTEN_GUARD_MS } from '../config/constants';
import { midiToHz, writtenToConcert } from '../music/notes';
import { App } from '../components/App';
import { createFakeAudioServices, type FakeAudioServices } from './fakeAudioServices';

/** Interval between fake microphone frames (≈ 50 fps). */
export const FRAME_MS = 20;
/** Comfortably above the default threshold. */
export const LOUD_DB = -20;

export const concertHz = (written: number): number => midiToHz(writtenToConcert(written));

/**
 * Renders <App> with fake audio services. Call with `vi.useFakeTimers({ shouldAdvanceTime: true })`
 * active; all async steps are wrapped in `act`.
 */
export function renderApp(fake: FakeAudioServices = createFakeAudioServices()) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
  const utils = render(
    <AudioServicesProvider services={fake.services}>
      <App />
    </AudioServicesProvider>,
  );
  let clock = 0;

  const click = async (name: string | RegExp) => {
    await user.click(screen.getByRole('button', { name }));
    // Let pending promises (openMicrophone, playback.done) settle inside act.
    await act(async () => {});
  };

  return {
    ...utils,
    fake,
    user,
    click,
    startTraining: () => click('Start training'),
    finishPlayback: async () => {
      await act(async () => {
        fake.finishPlayback();
      });
    },
    elapse: async (ms: number) => {
      await act(async () => {
        vi.advanceTimersByTime(ms);
      });
    },
    /** Finish the current playback and wait out the guard. */
    toListening: async () => {
      await act(async () => {
        fake.finishPlayback();
      });
      await act(async () => {
        vi.advanceTimersByTime(LISTEN_GUARD_MS);
      });
    },
    /** Emits a tone every FRAME_MS on the latest mic session, spanning `durationMs` (ends included). */
    hold: async (hz: number | null, durationMs: number, levelDb = LOUD_DB) => {
      await act(async () => {
        const end = clock + durationMs;
        for (; clock <= end; clock += FRAME_MS) fake.emitTone({ hz, levelDb, timeMs: clock });
      });
    },
  };
}

export const noteBox = (index: number) => screen.getByTestId(`note-box-${index}`);
export const boxStates = () =>
  [0, 1, 2, 3, 4].map((i) => noteBox(i).getAttribute('data-state'));
