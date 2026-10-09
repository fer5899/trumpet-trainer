import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AudioServicesProvider } from '../audio/AudioServicesContext';
import { App } from '../components/App';
import { createFakeAudioServices, type FakeAudioServices } from './fakeAudioServices';
import { createFakeStorage } from './fakeStorage';
import { createSessionDriver } from './sessionDriver';

export interface RenderAppOptions {
  /** Injected into <App storage>; defaults to an empty fake storage. Pass `null` for "no storage". */
  storage?: Storage | null;
}

/**
 * Renders <App> with fake audio services and a fake storage (never the real `localStorage`).
 * Call with `vi.useFakeTimers({ shouldAdvanceTime: true })` active; all async steps are wrapped in `act`.
 */
export function renderApp(
  fake: FakeAudioServices = createFakeAudioServices(),
  { storage = createFakeStorage() }: RenderAppOptions = {},
) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
  const utils = render(
    <AudioServicesProvider services={fake.services}>
      <App storage={storage} />
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
    storage,
    user,
    click,
    startTraining: () => click('Start training'),
    openSettings: () => click('Settings'),
  };
}

export const noteBox = (index: number) => screen.getByTestId(`note-box-${index}`);
/** data-state of every rendered note box, in order. */
export const boxStates = () =>
  screen.queryAllByTestId(/^note-box-\d+$/).map((box) => box.getAttribute('data-state'));
