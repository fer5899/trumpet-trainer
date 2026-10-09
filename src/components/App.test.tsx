import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPLETE_PAUSE_MS,
  DEFAULT_MAX_INTERVAL,
  DEFAULT_MELODY_LENGTH,
  DEFAULT_NOTE_DURATION_MS,
  DEFAULT_SCALE_ID,
  DEFAULT_THRESHOLD_DB,
  DEFAULT_VOLUME,
  LISTEN_GUARD_MS,
  METER_MAX_DB,
  METER_MIN_DB,
  SETTINGS_STORAGE_KEY,
  SUSTAIN_MS,
  THRESHOLD_STEP_DB,
  THRESHOLD_STORAGE_KEY,
} from '../config/constants';
import { DEFAULT_SETTINGS, type Settings } from '../config/settings';
import * as melodyModule from '../music/melody';
import { boxStates, noteBox, renderApp } from '../test/appTestUtils';
import { createFakeAudioServices } from '../test/fakeAudioServices';
import { createFakeStorage, createThrowingStorage } from '../test/fakeStorage';
import { requireSpecificScale } from '../test/scales';
import { concertHz, FRAME_MS, TIMER_DRIFT_MARGIN_MS } from '../test/sessionDriver';
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
const gear = () => screen.getByRole('button', { name: 'Settings' });
const settingsDialog = () => screen.getByRole('dialog', { name: 'Settings' });
const settingSlider = (name: string) => within(settingsDialog()).getByRole('slider', { name });
const scaleInput = () => within(settingsDialog()).getByRole('combobox', { name: 'Scale' });
const storedSettings = (storage: Storage | null) => JSON.parse(storage!.getItem(SETTINGS_STORAGE_KEY)!) as Settings;

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

  it('threshold changes persist Home → Training → Home, are used in training and saved to the injected storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const { fake, startTraining, toListening, hold, click, storage } = renderApp();
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
    expect(storage!.getItem(THRESHOLD_STORAGE_KEY)).toBe('-30');
    // Only the injected storage is used, never the real localStorage.
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

  it('generates the exercise with the default settings (length 5, max interval 12, Do major)', async () => {
    const { startTraining } = renderApp();
    await startTraining();
    expect(melodyModule.generateExercise).toHaveBeenCalledTimes(1);
    expect(melodyModule.generateExercise).toHaveBeenCalledWith(Math.random, {
      length: DEFAULT_MELODY_LENGTH,
      maxInterval: DEFAULT_MAX_INTERVAL,
      scaleId: DEFAULT_SCALE_ID,
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

describe('App — Settings', () => {
  it('the gear is on Home and on Training and opens the dialog in the matching mode', async () => {
    const { startTraining, openSettings, click } = renderApp();
    expect(gear()).toBeEnabled();
    await openSettings();
    expect(scaleInput()).toBeInTheDocument();
    expect(within(settingsDialog()).getAllByRole('slider')).toHaveLength(4);
    await click('Close');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await startTraining();
    expect(gear()).toBeEnabled();
    await openSettings();
    expect(within(settingsDialog()).getAllByRole('slider')).toHaveLength(2);
    expect(within(settingsDialog()).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Other settings can be changed on the home screen.')).toBeInTheDocument();
  });

  it('the gear is disabled while Start is opening the microphone', async () => {
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
    expect(gear()).toBeDisabled();
    await act(async () => resolveOpen());
    expect(gear()).toBeEnabled();
  });

  it('Escape closes the dialog', async () => {
    const { openSettings, user } = renderApp();
    await openSettings();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('every change is saved immediately; settings and threshold survive a remount (reload)', async () => {
    const storage = createFakeStorage();
    const first = renderApp(createFakeAudioServices(), { storage });
    await first.openSettings();
    fireEvent.change(settingSlider('Melody length'), { target: { value: '8' } });
    expect(storedSettings(storage).melodyLength).toBe(8);
    fireEvent.change(settingSlider('Note duration'), { target: { value: '750' } });
    fireEvent.change(settingSlider('Playback volume'), { target: { value: '80' } });
    fireEvent.change(settingSlider('Max interval'), { target: { value: '7' } });
    await first.user.click(scaleInput());
    await first.user.keyboard('all scales{Enter}');
    const expected: Settings = { noteDurationMs: 750, melodyLength: 8, volume: 0.8, maxInterval: 7, scaleId: 'group:all' };
    expect(storedSettings(storage)).toEqual(expected);
    await first.click('Close');
    fireEvent.change(slider(), { target: { value: '-25' } });
    first.unmount();

    const second = renderApp(createFakeAudioServices(), { storage });
    expect(slider()).toHaveValue('-25');
    await second.openSettings();
    expect(scaleInput()).toHaveValue('All scales');
    expect(settingSlider('Melody length')).toHaveValue('8');
    expect(settingSlider('Note duration')).toHaveValue('750');
    expect(settingSlider('Playback volume')).toHaveValue('80');
    expect(settingSlider('Max interval')).toHaveValue('7');
  });

  it('stored settings drive the generated exercise, the box count and the playback', async () => {
    const settings: Settings = { noteDurationMs: 500, melodyLength: 8, volume: 0.25, maxInterval: 4, scaleId: 'group:major' };
    const storage = createFakeStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify(settings) });
    const notes = [60, 62, 64, 65, 67, 69, 71, 72];
    vi.mocked(melodyModule.generateExercise).mockReturnValue({ notes, scale: 'chromatic' });
    const { fake, startTraining } = renderApp(createFakeAudioServices(), { storage });
    await startTraining();
    expect(melodyModule.generateExercise).toHaveBeenCalledWith(Math.random, {
      length: 8,
      maxInterval: 4,
      scaleId: 'group:major',
    });
    expect(boxStates()).toHaveLength(8);
    expect(fake.playCalls[0]).toEqual({
      frequenciesHz: notes.map(concertHz),
      noteDurationMs: 500,
      volume: 0.25,
      volumeChanges: [],
    });
  });

  it('a 3-note exercise shows 3 boxes and "of 3"', async () => {
    vi.mocked(melodyModule.generateExercise).mockReturnValue({ notes: [71, 60, 72], scale: 'chromatic' });
    const { startTraining, toListening } = renderApp();
    await startTraining();
    await toListening();
    expect(boxStates()).toEqual(['active', 'pending', 'pending']);
    expect(status()).toHaveTextContent('Your turn: play note 1 of 3');
  });

  it('a scale exercise is spelled in its key (Fa major: 70 → Si♭4)', async () => {
    vi.mocked(melodyModule.generateExercise).mockReturnValue({
      notes: [70, 70, 70],
      scale: requireSpecificScale('major:fa'),
    });
    const { startTraining, toListening, hold } = renderApp();
    await startTraining();
    await toListening();
    await hold(concertHz(70), SUSTAIN_MS + FRAME_MS);
    expect(noteBox(0)).toHaveTextContent('Si♭4');
  });

  it.each([
    ['throwing storage', createThrowingStorage],
    ['no storage (null)', () => null],
  ])('%s: defaults, fully usable, changes kept in memory', async (_label, makeStorage) => {
    const { openSettings, startTraining, user } = renderApp(createFakeAudioServices(), { storage: makeStorage() });
    expect(slider()).toHaveValue(String(DEFAULT_THRESHOLD_DB));
    fireEvent.change(slider(), { target: { value: '-30' } });
    expect(slider()).toHaveValue('-30');
    await openSettings();
    expect(settingSlider('Melody length')).toHaveValue(String(DEFAULT_SETTINGS.melodyLength));
    fireEvent.change(settingSlider('Melody length'), { target: { value: '3' } });
    expect(settingSlider('Melody length')).toHaveValue('3');
    await user.keyboard('{Escape}');
    await startTraining();
    expect(melodyModule.generateExercise).toHaveBeenCalledWith(Math.random, expect.objectContaining({ length: 3 }));
    expect(noteBox(0)).toBeInTheDocument();
  });

  it('invalid stored data falls back to defaults', async () => {
    const storage = createFakeStorage({ [SETTINGS_STORAGE_KEY]: '{oops', [THRESHOLD_STORAGE_KEY]: '"abc"' });
    const { openSettings } = renderApp(createFakeAudioServices(), { storage });
    expect(screen.getByText('Threshold: −40 dB')).toBeInTheDocument();
    await openSettings();
    expect(scaleInput()).toHaveValue('Do major');
    expect(settingSlider('Note duration')).toHaveValue(String(DEFAULT_NOTE_DURATION_MS));
  });

  it('Reset to defaults on Home restores all settings but never the threshold', async () => {
    const custom: Settings = { noteDurationMs: 750, melodyLength: 8, volume: 0.8, maxInterval: 5, scaleId: 'minor:re' };
    const storage = createFakeStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify(custom),
      [THRESHOLD_STORAGE_KEY]: '-20',
    });
    const { openSettings, click } = renderApp(createFakeAudioServices(), { storage });
    await openSettings();
    await click('Reset to defaults');
    expect(storedSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(storage.getItem(THRESHOLD_STORAGE_KEY)).toBe('-20');
    await click('Close');
    expect(slider()).toHaveValue('-20');
  });

  it('dialog during training: volume applies to the running playback, nothing restarts, listening continues', async () => {
    const { fake, startTraining, toListening, hold, openSettings, click, storage } = renderApp();
    await startTraining();
    await openSettings();
    fireEvent.change(settingSlider('Playback volume'), { target: { value: '80' } });
    expect(fake.playCalls).toHaveLength(1);
    expect(fake.playCalls[0].volumeChanges).toEqual([0.8]);
    fireEvent.change(settingSlider('Note duration'), { target: { value: '750' } });
    expect(fake.playCalls).toHaveLength(1);
    expect(storedSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, volume: 0.8, noteDurationMs: 750 });

    // Listening continues behind the open dialog.
    await toListening();
    await hold(concertHz(MELODY[0]), SUSTAIN_MS + FRAME_MS);
    expect(boxStates()).toEqual(['done', 'active', 'pending', 'pending', 'pending']);
    expect(settingsDialog()).toBeInTheDocument();

    // The Training reset restores only duration and volume and restarts nothing.
    await click('Reset to defaults');
    expect(storedSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(fake.playCalls[0].volumeChanges).toEqual([0.8]);
    await click('Close');
    expect(boxStates()).toEqual(['done', 'active', 'pending', 'pending', 'pending']);
    expect(status()).toHaveTextContent('Your turn: play note 2 of 5');

    // A new note duration applies on Repeat; progress is kept and no new exercise is generated.
    await openSettings();
    fireEvent.change(settingSlider('Note duration'), { target: { value: '1500' } });
    await click('Close');
    await click('Repeat melody');
    expect(fake.playCalls).toHaveLength(2);
    expect(fake.playCalls[1]).toEqual({
      frequenciesHz: MELODY.map(concertHz),
      noteDurationMs: 1500,
      volume: DEFAULT_VOLUME,
      volumeChanges: [],
    });
    expect(boxStates()).toEqual(['done', 'active', 'pending', 'pending', 'pending']);
    expect(melodyModule.generateExercise).toHaveBeenCalledTimes(1);
  });

  it('the dialog stays open when the exercise completes and switches to the Home controls', async () => {
    vi.mocked(melodyModule.generateExercise).mockReturnValue({ notes: [71, 71, 71], scale: 'chromatic' });
    const { startTraining, toListening, hold, openSettings, elapse } = renderApp();
    await startTraining();
    await toListening();
    await openSettings();
    for (let i = 0; i < 3; i += 1) await hold(concertHz(71), SUSTAIN_MS + FRAME_MS);
    expect(status()).toHaveTextContent('Well done!');
    await elapse(COMPLETE_PAUSE_MS);
    expect(startButton()).toBeInTheDocument();
    expect(settingsDialog()).toBeInTheDocument();
    expect(scaleInput()).toBeInTheDocument();
    expect(within(settingsDialog()).getAllByRole('slider')).toHaveLength(4);
  });
});
