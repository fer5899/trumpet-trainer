import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AudioServicesProvider } from '../audio/AudioServicesContext';
import { MELODY_LENGTH } from '../config/constants';
import { App } from '../components/App';
import { createFakeAudioServices, type FakeAudioServices } from './fakeAudioServices';
import { createSessionDriver } from './sessionDriver';

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

  const click = async (name: string | RegExp) => {
    await user.click(screen.getByRole('button', { name }));
    // Let pending promises (openMicrophone, playback.done) settle inside act.
    await act(async () => {});
  };

  return {
    ...utils,
    ...createSessionDriver(fake),
    fake,
    click,
    startTraining: () => click('Start training'),
  };
}

export const noteBox = (index: number) => screen.getByTestId(`note-box-${index}`);
export const boxStates = () =>
  Array.from({ length: MELODY_LENGTH }, (_, i) => noteBox(i).getAttribute('data-state'));
