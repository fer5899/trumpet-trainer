import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPLETE_PAUSE_MS,
  DEFAULT_MELODY_LENGTH,
  DEFAULT_NOTE_DURATION_MS,
  DEFAULT_THRESHOLD_DB,
  DEFAULT_VOLUME,
  LISTEN_GUARD_MS,
  MAX_INTERVAL_LIMIT,
  METER_MAX_DB,
  METER_MIN_DB,
  SUSTAIN_MS,
  THRESHOLD_STEP_DB,
} from '../config/constants';
import * as melodyModule from '../music/melody';
import { CHROMATIC_ID } from '../music/scales';
import { boxStates, noteBox, renderApp } from '../test/appTestUtils';
import { concertHz, FRAME_MS, TIMER_DRIFT_MARGIN_MS } from '../test/sessionDriver';
import { createFakeAudioServices } from '../test/fakeAudioServices';
import { micErrorMessage } from './micErrorMessage';

// Deterministic melody: written Si4, Do4, Do5, Fa#3, Fa#4 (spelled Si4 Do4 Do5 Sol♭3 Fa#4).
const MELODY = [71, 60, 72, 54, 66];
const NAMES = ['Si4', 'Do4', 'Do5', 'Sol♭3', 'Fa#4'];

const startButton = () => screen.getByRole('button', { name: 'Start training' });
const testMicButton = () => screen.getByRole('button', { name: 'Test microphone' });
const meter = () => screen.getByRole('meter', { name: 'Microphone level' });
const slider = () => screen.getByRole('slider', { name: 'Threshold' });
const repeatButton = () => screen.getByRole('button', { name: 'Repeat melody' });
const giveUpButton = () => screen.getByRole('button', { name: 'Give up' });
const status = () => screen.getByTestId('training-status');

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(melodyModule, 'generateExercise').mockReturnValue({ notes: [...MELODY], scale: 'chromatic' });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('App — Home / microphone', () => {
  it('shows the title, Start, an unpressed Test microphone, a meter at −60 and the threshold slider', () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'Trumpet Trainer' })).toBeInTheDocument();
    expect(startButton()).toBeEnabled();
    expect(testMicButton()).toHaveAttribute('aria-pressed', 'false');
    expect(meter()).toHaveAttribute('aria-valuenow', String(METER_MIN_DB));
    expect(meter()).toHaveAttribute('aria-valuemin', String(METER_MIN_DB));
    expect(meter()).toHaveAttribute('aria-valuemax', String(METER_MAX_DB));
    expect(slider()).toHaveValue(String(DEFAULT_THRESHOLD_DB));
    expect(slider()).toHaveAttribute('min', String(METER_MIN_DB));
    expect(slider()).toHaveAttribute('max', String(METER_MAX_DB));
    expect(slider()).toHaveAttribute('step', String(THRESHOLD_STEP_DB));
    expect(slider()).toBeEnabled();
    expect(screen.getByText('Threshold: −40 dB')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('toggling the test on opens one session, the meter follows frames, off releases it and resets to −60', async () => {
    const { fake, click } = renderApp();
    await click('Test microphone');
    expect(testMicButton()).toHaveAttribute('aria-pressed', 'true');
    expect(fake.services.openMicrophone).toHaveBeenCalledTimes(1);
    expect(fake.sessions).toHaveLength(1);
    expect(fake.sessions[0].listenerCount).toBe(1);

    act(() => fake.emitTone({ hz: null, levelDb: -22, timeMs: 0 }));
    expect(meter()).toHaveAttribute('aria-valuenow', '-22');
    act(() => fake.emitTone({ hz: null, levelDb: -95, timeMs: 20 }));
    expect(meter()).toHaveAttribute('aria-valuenow', String(METER_MIN_DB));

    await click('Test microphone');
    expect(testMicButton()).toHaveAttribute('aria-pressed', 'false');
    expect(fake.sessions[0].released).toBe(true);
    expect(fake.sessions[0].listenerCount).toBe(0);
    expect(meter()).toHaveAttribute('aria-valuenow', String(METER_MIN_DB));
    expect(fake.services.openMicrophone).toHaveBeenCalledTimes(1);
  });

  it('threshold changes persist Home → Training → Home and are used in training; no localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const { fake, startTraining, toListening, hold, click } = renderApp();
    fireEvent.change(slider(), { target: { value: '-30' } });
    expect(slider()).toHaveValue('-30');
    expect(screen.getByText('Threshold: −30 dB')).toBeInTheDocument();

    await startTraining();
    await toListening();
    // Correct note at −35 dB: above the default (−40) but below the chosen −30 → ignored.
    await hold(concertHz(MELODY[0]), SUSTAIN_MS * 2, -35);
    expect(noteBox(0)).toHaveAttribute('data-state', 'active');
    expect(fake.services.detectPitch).not.toHaveBeenCalled();

    await click('Give up');
    expect(slider()).toHaveValue('-30');
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
  });

  it('Start while the test is on releases the test session, then opens a new one before playback', async () => {
    const { fake, click, startTraining } = renderApp();
    await click('Test microphone');
    const testSession = fake.sessions[0];
    const release = vi.spyOn(testSession, 'release');

    await startTraining();
    expect(release).toHaveBeenCalled();
    expect(testSession.released).toBe(true);
    expect(fake.sessions).toHaveLength(2);
    expect(fake.sessions[1].released).toBe(false);
    const secondOpen = fake.services.openMicrophone.mock.invocationCallOrder[1];
    expect(release.mock.invocationCallOrder[0]).toBeLessThan(secondOpen);
    expect(fake.services.playMelody.mock.invocationCallOrder[0]).toBeGreaterThan(secondOpen);
    expect(fake.services.playMelody).toHaveBeenCalledTimes(1);
  });

  it.each(['permission-denied', 'unsupported', 'unknown'] as const)(
    'mic rejected (%s) → stays Home with the message, nothing played, Start enabled; a later Start clears it',
    async (kind) => {
      const fake = createFakeAudioServices();
      fake.failNextMicrophone(kind);
      const { startTraining } = renderApp(fake);
      await startTraining();
      expect(screen.getByRole('alert')).toHaveTextContent(micErrorMessage(kind));
      expect(startButton()).toBeEnabled();
      expect(screen.queryByTestId('note-box-0')).not.toBeInTheDocument();
      expect(fake.services.playMelody).not.toHaveBeenCalled();
      expect(melodyModule.generateExercise).not.toHaveBeenCalled();

      await startTraining();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(noteBox(0)).toBeInTheDocument();
      expect(fake.services.playMelody).toHaveBeenCalledTimes(1);
    },
  );

  it('Start is disabled while the microphone is opening', async () => {
    const fake = createFakeAudioServices();
    let resolveOpen!: () => void;
    fake.services.openMicrophone.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOpen = () => resolve({ sampleRate: 48000, subscribe: () => () => undefined, release: () => undefined });
        }),
    );
    renderApp(fake);
    fireEvent.click(startButton());
    expect(startButton()).toBeDisabled();
    await act(async () => resolveOpen());
    expect(noteBox(0)).toBeInTheDocument();
  });

  it('Test microphone is disabled while Start is opening the mic; returning Home leaves it off', async () => {
    const fake = createFakeAudioServices();
    let resolveOpen!: () => void;
    const trainingSession = { sampleRate: 48000, subscribe: vi.fn(() => () => undefined), release: vi.fn() };
    fake.services.openMicrophone.mockImplementationOnce(
      () => new Promise((resolve) => (resolveOpen = () => resolve(trainingSession))),
    );
    const { toListening, click } = renderApp(fake);
    fireEvent.click(startButton());
    expect(testMicButton()).toBeDisabled();
    // A click while the permission prompt is open must not re-enable the test.
    fireEvent.click(testMicButton());
    expect(testMicButton()).toHaveAttribute('aria-pressed', 'false');

    await act(async () => resolveOpen());
    await toListening();
    await click('Give up');
    expect(trainingSession.release).toHaveBeenCalled();
    expect(testMicButton()).toHaveAttribute('aria-pressed', 'false');
    expect(testMicButton()).toBeEnabled();
    expect(fake.services.openMicrophone).toHaveBeenCalledTimes(1);
  });

  it('a rejected test microphone shows the message and turns the toggle off', async () => {
    const fake = createFakeAudioServices();
    fake.failNextMicrophone('permission-denied');
    const { click } = renderApp(fake);
    await click('Test microphone');
    expect(screen.getByRole('alert')).toHaveTextContent(micErrorMessage('permission-denied'));
    expect(testMicButton()).toHaveAttribute('aria-pressed', 'false');
  });

  it('a denied test microphone followed by a denied Start shows a single alert', async () => {
    const fake = createFakeAudioServices();
    fake.failNextMicrophone('permission-denied');
    const { click, startTraining } = renderApp(fake);
    await click('Test microphone');
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    fake.failNextMicrophone('permission-denied');
    await startTraining();
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(micErrorMessage('permission-denied'));
  });

  it('Start clears a previous test-microphone error even when Start succeeds and Home returns', async () => {
    const fake = createFakeAudioServices();
    fake.failNextMicrophone('unknown');
    const { click, startTraining, toListening } = renderApp(fake);
    await click('Test microphone');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await startTraining();
    await toListening();
    await click('Give up');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('unlock() is called synchronously in the Start and Test microphone click handlers', () => {
    const fake = createFakeAudioServices();
    fake.services.openMicrophone.mockImplementation(() => new Promise(() => undefined));
    renderApp(fake);
    fireEvent.click(testMicButton());
    expect(fake.services.unlock).toHaveBeenCalledTimes(1);
    fireEvent.click(startButton());
    expect(fake.services.unlock).toHaveBeenCalledTimes(2);
    expect(fake.services.unlock.mock.invocationCallOrder[1]).toBeLessThan(
      fake.services.openMicrophone.mock.invocationCallOrder.at(-1)!,
    );
  });
});

describe('App — Training flow', () => {
  it('after Start: 5 boxes (first active), buttons disabled, melody played once in concert pitch', async () => {
    const { fake, startTraining } = renderApp();
    await startTraining();
    expect(boxStates()).toEqual(['active', 'pending', 'pending', 'pending', 'pending']);
    expect(noteBox(0)).toHaveAccessibleName('Note 1: active');
    expect(noteBox(1)).toHaveAccessibleName('Note 2: pending');
    expect(repeatButton()).toBeDisabled();
    expect(giveUpButton()).toBeDisabled();
    expect(status()).toHaveTextContent('Listen…');
    expect(fake.services.playMelody).toHaveBeenCalledTimes(1);
    expect(fake.playCalls[0]).toEqual({
      frequenciesHz: MELODY.map(concertHz),
      noteDurationMs: DEFAULT_NOTE_DURATION_MS,
      volume: DEFAULT_VOLUME,
      volumeChanges: [],
    });
    expect(fake.services.playMelody.mock.calls[0][0][0]).toBeCloseTo(440, 6);
  });

  it('generates a chromatic exercise of the default length with the widest max interval', async () => {
    const { startTraining } = renderApp();
    await startTraining();
    expect(melodyModule.generateExercise).toHaveBeenCalledTimes(1);
    expect(melodyModule.generateExercise).toHaveBeenCalledWith(Math.random, {
      length: DEFAULT_MELODY_LENGTH,
      maxInterval: MAX_INTERVAL_LIMIT,
      scaleId: CHROMATIC_ID,
    });
  });

  it('frames during playing and during the guard never match', async () => {
    const { fake, startTraining, finishPlayback, elapse, hold } = renderApp();
    await startTraining();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS * 2);
    await finishPlayback();
    expect(status()).toHaveTextContent('Get ready…');
    expect(repeatButton()).toBeDisabled();
    await hold(concertHz(MELODY[0]), LISTEN_GUARD_MS - FRAME_MS * 2);
    await elapse(LISTEN_GUARD_MS);
    expect(status()).toHaveTextContent('Your turn: play note 1 of 5');
    expect(noteBox(0)).toHaveAttribute('data-state', 'active');
    expect(fake.services.detectPitch).not.toHaveBeenCalled();
    expect(repeatButton()).toBeEnabled();
    expect(giveUpButton()).toBeEnabled();
  });

  it('a correct tone above threshold held ≥ 500 ms (frames every 20 ms) turns the box green and advances', async () => {
    const { startTraining, toListening, hold } = renderApp();
    await startTraining();
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS - FRAME_MS);
    expect(noteBox(0)).toHaveAttribute('data-state', 'active');
    await hold(concertHz(MELODY[0]), 0);
    expect(noteBox(0)).toHaveAttribute('data-state', 'done');
    expect(noteBox(0)).toHaveTextContent(NAMES[0]);
    expect(noteBox(0)).toHaveAccessibleName(`Note 1: done ${NAMES[0]}`);
    expect(noteBox(1)).toHaveAttribute('data-state', 'active');
    expect(status()).toHaveTextContent('Your turn: play note 2 of 5');
  });

  it.each([
    ['a wrong note', concertHz(MELODY[0] + 1), -20],
    ['the right note an octave up', concertHz(MELODY[0] + 12), -20],
    ['the right note an octave down', concertHz(MELODY[0] - 12), -20],
    ['the right note below threshold', concertHz(MELODY[0]), DEFAULT_THRESHOLD_DB - 1],
  ])('%s changes nothing', async (_label, hz, levelDb) => {
    const { startTraining, toListening, hold } = renderApp();
    await startTraining();
    await toListening();
    await hold(hz, SUSTAIN_MS * 3, levelDb);
    expect(boxStates()).toEqual(['active', 'pending', 'pending', 'pending', 'pending']);
    expect(status()).toHaveTextContent('Your turn: play note 1 of 5');
  });

  it('Repeat: disables buttons, replays, keeps progress and active index, resets sustain, keeps the mic', async () => {
    const { fake, startTraining, toListening, hold, click, elapse, finishPlayback } = renderApp();
    await startTraining();
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS);
    expect(noteBox(0)).toHaveAttribute('data-state', 'done');
    // Partial sustain on note 2, then Repeat.
    await hold(concertHz(MELODY[1]), SUSTAIN_MS - FRAME_MS * 3);

    await click('Repeat melody');
    expect(fake.services.playMelody).toHaveBeenCalledTimes(2);
    expect(fake.playCalls[1]).toEqual(fake.playCalls[0]);
    expect(repeatButton()).toBeDisabled();
    expect(giveUpButton()).toBeDisabled();
    expect(status()).toHaveTextContent('Listen…');
    expect(boxStates()).toEqual(['done', 'active', 'pending', 'pending', 'pending']);
    expect(noteBox(0)).toHaveTextContent(NAMES[0]);
    expect(fake.sessions[0].released).toBe(false);

    // Listening resumes only after playback + guard.
    await hold(concertHz(MELODY[1]), SUSTAIN_MS);
    await finishPlayback();
    await elapse(LISTEN_GUARD_MS - TIMER_DRIFT_MARGIN_MS);
    expect(repeatButton()).toBeDisabled();
    await elapse(TIMER_DRIFT_MARGIN_MS);
    expect(repeatButton()).toBeEnabled();
    expect(noteBox(1)).toHaveAttribute('data-state', 'active');

    // Sustain progress was reset: a short hold does not complete note 2.
    await hold(concertHz(MELODY[1]), FRAME_MS * 3);
    expect(noteBox(1)).toHaveAttribute('data-state', 'active');
    await hold(concertHz(MELODY[1]), SUSTAIN_MS);
    expect(noteBox(1)).toHaveAttribute('data-state', 'done');
    expect(fake.sessions).toHaveLength(1);
    expect(fake.sessions[0].released).toBe(false);
  });

  it('Give up: playback stopped, mic released, Home shown', async () => {
    const { fake, startTraining, toListening, click } = renderApp();
    await startTraining();
    // The button is disabled during playback (§5.4); stopping playback on give up is covered by
    // useTrainingSession.test.tsx.
    expect(giveUpButton()).toBeDisabled();
    await toListening();
    await click('Give up');
    expect(fake.sessions[0].released).toBe(true);
    expect(startButton()).toBeInTheDocument();
    expect(screen.queryByTestId('note-box-0')).not.toBeInTheDocument();
  });

  it('after the 5th match: all green, buttons disabled, then after 1500 ms mic released and Home shown', async () => {
    const { fake, startTraining, toListening, hold, elapse } = renderApp();
    await startTraining();
    await toListening();
    for (const note of MELODY) await hold(concertHz(note), SUSTAIN_MS + FRAME_MS);

    expect(boxStates()).toEqual(['done', 'done', 'done', 'done', 'done']);
    NAMES.forEach((name, i) => expect(noteBox(i)).toHaveTextContent(name));
    expect(status()).toHaveTextContent('Well done!');
    expect(repeatButton()).toBeDisabled();
    expect(giveUpButton()).toBeDisabled();

    await elapse(COMPLETE_PAUSE_MS - TIMER_DRIFT_MARGIN_MS);
    expect(fake.sessions[0].released).toBe(false);
    expect(noteBox(0)).toBeInTheDocument();
    await elapse(TIMER_DRIFT_MARGIN_MS);
    expect(fake.sessions[0].released).toBe(true);
    expect(startButton()).toBeEnabled();
    expect(within(document.body).queryByTestId('training-status')).not.toBeInTheDocument();
  });

  it('a new exercise after returning Home opens a fresh session and plays again', async () => {
    const { fake, startTraining, toListening, click } = renderApp();
    await startTraining();
    await toListening();
    await click('Give up');
    await startTraining();
    expect(fake.sessions).toHaveLength(2);
    expect(fake.services.playMelody).toHaveBeenCalledTimes(2);
    expect(boxStates()).toEqual(['active', 'pending', 'pending', 'pending', 'pending']);
  });
});
