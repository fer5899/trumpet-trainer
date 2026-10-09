import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  resetSettings,
  selectScale,
  type Settings,
} from '../config/settings';
import {
  MAX_INTERVAL_LIMIT,
  MAX_MELODY_LENGTH,
  MAX_NOTE_DURATION_MS,
  MIN_MELODY_LENGTH,
  MIN_NOTE_DURATION_MS,
  NOTE_DURATION_STEP_MS,
  PERCENT,
  VOLUME_STEP_PERCENT,
} from '../config/constants';
import { minMaxInterval } from '../music/scales';
import { SettingsDialog, type SettingsDialogProps } from './SettingsDialog';

const CUSTOM: Settings = { noteDurationMs: 750, melodyLength: 8, volume: 0.8, maxInterval: 5, scaleId: 'minor:re' };

function setup(props: Partial<SettingsDialogProps> = {}) {
  const onClose = vi.fn<() => void>();
  const onChange = vi.fn<(settings: Settings) => void>();
  const all: SettingsDialogProps = {
    open: true,
    onClose,
    mode: 'home',
    settings: { ...DEFAULT_SETTINGS },
    onChange,
    ...props,
  };
  const user = userEvent.setup();
  const utils = render(<SettingsDialog {...all} />);
  const rerender = (next: Partial<SettingsDialogProps>) => utils.rerender(<SettingsDialog {...all} {...next} />);
  return { ...utils, user, onClose, onChange, rerender };
}

const dialog = () => screen.getByRole('dialog', { name: 'Settings' });
const slider = (name: string) => screen.getByRole('slider', { name });
const scaleInput = () => screen.getByRole('combobox', { name: 'Scale' });
const lastChange = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as Settings;

describe('SettingsDialog — open / close', () => {
  it('is a modal dialog named Settings while open; closed, nothing is shown', () => {
    const { rerender } = setup();
    expect(dialog()).toHaveAttribute('open');
    expect(dialog()).toHaveClass('settings-dialog');
    expect(within(dialog()).getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    rerender({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    rerender({ open: true });
    expect(dialog()).toBeInTheDocument();
  });

  it('closed initially: showModal is not called', () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    setup({ open: false });
    expect(showModal).not.toHaveBeenCalled();
    showModal.mockRestore();
  });

  it('opening calls showModal; closing calls close', () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const close = vi.spyOn(HTMLDialogElement.prototype, 'close');
    const { rerender, onClose } = setup({ open: false });
    rerender({ open: true });
    expect(showModal).toHaveBeenCalledTimes(1);
    rerender({ open: false });
    expect(close).toHaveBeenCalledTimes(1);
    // Closing driven by the prop does not report back.
    expect(onClose).not.toHaveBeenCalled();
    showModal.mockRestore();
    close.mockRestore();
  });

  it('focuses the dialog itself on open (the scale list stays closed)', () => {
    setup();
    expect(dialog()).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('marks the dialog autofocus before showModal, so the browser never focuses the scale input first', () => {
    const autofocusAtShowModal: boolean[] = [];
    const showModal = vi
      .spyOn(HTMLDialogElement.prototype, 'showModal')
      .mockImplementation(function (this: HTMLDialogElement) {
        autofocusAtShowModal.push(this.hasAttribute('autofocus'));
        this.open = true;
      });
    const { rerender } = setup({ open: false });
    rerender({ open: true });
    expect(autofocusAtShowModal).toEqual([true]);
    expect(dialog()).toHaveFocus();
    showModal.mockRestore();
  });

  it('Close calls onClose', async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape calls onClose', async () => {
    const { user, onClose } = setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape with the scale list open closes only the list', async () => {
    const { user, onClose } = setup();
    await user.click(scaleInput());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the native cancel event is always prevented', () => {
    setup();
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
  });

  it('a native close while still open (forced by the browser) calls onClose', () => {
    const { onClose } = setup();
    (dialog() as HTMLDialogElement).close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the dialog surface (backdrop area) does nothing', async () => {
    const { user, onClose } = setup();
    await user.click(dialog());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the combobox state resets on every opening', async () => {
    const { user, rerender } = setup();
    await user.click(scaleInput());
    await user.keyboard('xyz');
    rerender({ open: false });
    rerender({ open: true });
    expect(scaleInput()).toHaveValue('Do major');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('SettingsDialog — Home mode', () => {
  it('shows the five controls with limits, steps, values and aria-valuetext (defaults)', () => {
    setup();
    expect(scaleInput()).toHaveValue('Do major');
    const expectSlider = (name: string, min: number, max: number, step: number, value: number, text: string) => {
      const el = slider(name);
      expect(el).toHaveAttribute('type', 'range');
      expect(el).toHaveAttribute('min', String(min));
      expect(el).toHaveAttribute('max', String(max));
      expect(el).toHaveAttribute('step', String(step));
      expect(el).toHaveValue(String(value));
      expect(el).toHaveAttribute('aria-valuetext', text);
      expect(el.closest('.setting')!.querySelector('.setting__value')).toHaveTextContent(text);
      expect(el.closest('.setting')!.querySelector('.setting__value')).toHaveAttribute('aria-hidden', 'true');
    };
    expectSlider('Melody length', MIN_MELODY_LENGTH, MAX_MELODY_LENGTH, 1, 5, '5 notes');
    expectSlider('Max interval', minMaxInterval('major:do'), MAX_INTERVAL_LIMIT, 1, 12, '12 semitones');
    expectSlider('Note duration', MIN_NOTE_DURATION_MS, MAX_NOTE_DURATION_MS, NOTE_DURATION_STEP_MS, 1000, '1000 ms');
    expectSlider('Playback volume', 0, PERCENT, VOLUME_STEP_PERCENT, 50, '50%');
    expect(screen.getAllByRole('slider')).toHaveLength(4);
    expect(screen.queryByText('Other settings can be changed on the home screen.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('shows custom values ("1 semitone" singular for chromatic)', () => {
    setup({ settings: { ...CUSTOM, scaleId: 'chromatic', maxInterval: 1 } });
    expect(scaleInput()).toHaveValue('Chromatic');
    expect(slider('Max interval')).toHaveAttribute('min', '1');
    expect(slider('Max interval')).toHaveAttribute('aria-valuetext', '1 semitone');
    expect(slider('Melody length')).toHaveAttribute('aria-valuetext', '8 notes');
    expect(slider('Note duration')).toHaveAttribute('aria-valuetext', '750 ms');
    expect(slider('Playback volume')).toHaveValue('80');
    expect(slider('Playback volume')).toHaveAttribute('aria-valuetext', '80%');
  });

  it.each([
    ['Melody length', '8', { melodyLength: 8 }],
    ['Max interval', '4', { maxInterval: 4 }],
    ['Note duration', '750', { noteDurationMs: 750 }],
    ['Playback volume', '80', { volume: 0.8 }],
    ['Playback volume', '35', { volume: 0.35 }],
    ['Playback volume', '0', { volume: 0 }],
  ] as const)('%s → %s calls onChange immediately with a whole Settings', (name, value, patch) => {
    const { onChange } = setup();
    fireEvent.change(slider(name), { target: { value } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastChange(onChange)).toEqual({ ...DEFAULT_SETTINGS, ...patch });
  });

  it('selecting a scale calls onChange with selectScale (raises max interval)', async () => {
    const settings = { ...DEFAULT_SETTINGS, maxInterval: 2 };
    const { user, onChange } = setup({ settings });
    await user.click(scaleInput());
    await user.keyboard('do major pentatonic{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastChange(onChange)).toEqual(selectScale(settings, 'major-pentatonic:do'));
    expect(lastChange(onChange).maxInterval).toBe(3);
  });

  it('the Max interval minimum follows the scale', () => {
    const { rerender } = setup({ settings: { ...DEFAULT_SETTINGS, scaleId: 'major-pentatonic:do', maxInterval: 3 } });
    expect(slider('Max interval')).toHaveAttribute('min', '3');
    expect(slider('Max interval')).toHaveAttribute('aria-valuetext', '3 semitones');
    rerender({ settings: { ...DEFAULT_SETTINGS, scaleId: 'group:all', maxInterval: 3 } });
    expect(slider('Max interval')).toHaveAttribute('min', String(minMaxInterval('group:all')));
    rerender({ settings: { ...DEFAULT_SETTINGS, scaleId: 'chromatic' } });
    expect(slider('Max interval')).toHaveAttribute('min', '1');
  });

  it('Reset to defaults restores all five settings', async () => {
    const { user, onChange } = setup({ settings: CUSTOM });
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastChange(onChange)).toEqual(resetSettings(CUSTOM, 'all'));
    expect(lastChange(onChange)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('SettingsDialog — Training mode', () => {
  it('shows only Note duration and Playback volume plus the hint', () => {
    setup({ mode: 'training', settings: CUSTOM });
    expect(screen.getAllByRole('slider').map((s) => s.getAttribute('aria-valuetext'))).toEqual(['750 ms', '80%']);
    expect(slider('Note duration')).toBeInTheDocument();
    expect(slider('Playback volume')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Melody length' })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Max interval' })).not.toBeInTheDocument();
    const hint = screen.getByText('Other settings can be changed on the home screen.');
    expect(hint.tagName).toBe('P');
    expect(hint).toHaveClass('settings-dialog__hint');
  });

  it('changes call onChange immediately', () => {
    const { onChange } = setup({ mode: 'training', settings: CUSTOM });
    fireEvent.change(slider('Playback volume'), { target: { value: '20' } });
    expect(lastChange(onChange)).toEqual({ ...CUSTOM, volume: 0.2 });
    fireEvent.change(slider('Note duration'), { target: { value: '1500' } });
    expect(lastChange(onChange)).toEqual({ ...CUSTOM, noteDurationMs: 1500 });
  });

  it('Reset to defaults restores only note duration and volume', async () => {
    const { user, onChange } = setup({ mode: 'training', settings: CUSTOM });
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(lastChange(onChange)).toEqual(resetSettings(CUSTOM, 'training'));
    expect(lastChange(onChange)).toEqual({ ...CUSTOM, noteDurationMs: 1000, volume: 0.5 });
  });

  it('switching mode while open shows the Home controls', () => {
    const { rerender } = setup({ mode: 'training' });
    rerender({ mode: 'home' });
    expect(dialog()).toBeInTheDocument();
    expect(scaleInput()).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(4);
  });
});
