import { useEffect, useId, useRef } from 'react';
import {
  MAX_INTERVAL_LIMIT,
  MAX_MELODY_LENGTH,
  MAX_NOTE_DURATION_MS,
  MAX_VOLUME,
  MAX_INTERVAL_STEP,
  MELODY_LENGTH_STEP,
  MIN_MELODY_LENGTH,
  MIN_NOTE_DURATION_MS,
  MIN_VOLUME,
  NOTE_DURATION_STEP_MS,
  VOLUME_STEP_PERCENT,
} from '../config/constants';
import { percentToVolume, resetSettings, selectScale, type Settings, volumeToPercent } from '../config/settings';
import { minMaxInterval } from '../music/scales';
import { ScaleCombobox } from './ScaleCombobox';
import { formatMaxInterval, formatMelodyLength, formatNoteDuration, formatVolume } from './settingsText';

export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
  /** 'training' shows only the settings that can change during an exercise. */
  mode: 'home' | 'training';
  settings: Settings;
  /** Called with a whole new Settings on every change (no Save step). */
  onChange(settings: Settings): void;
}

const TRAINING_HINT = 'Other settings can be changed on the home screen.';

interface SettingSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueText: string;
  onChange(value: number): void;
}

function SettingSlider({ label, min, max, step, value, valueText, onChange }: SettingSliderProps): JSX.Element {
  const id = useId();
  return (
    <div className="setting">
      <div className="setting__header">
        <label htmlFor={id}>{label}</label>
        <span className="setting__value" aria-hidden="true">
          {valueText}
        </span>
      </div>
      <input
        id={id}
        className="setting__slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

/**
 * Modal settings panel. The `<dialog>` is always mounted; its content renders only while `open`.
 * Closing is owned by the `open` prop: Close, Esc and a browser-forced close all call `onClose`.
 */
export function SettingsDialog({ open, onClose, mode, settings, onChange }: SettingsDialogProps): JSX.Element {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      // Start on the dialog itself: focusing the first control would open (and render) the scale
      // list. The `autofocus` attribute makes showModal's focusing steps pick the dialog (React's
      // autoFocus prop renders no attribute); el.focus() is the fallback where that is unsupported.
      el.setAttribute('autofocus', '');
      el.showModal();
      el.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  const update = (patch: Partial<Settings>): void => onChange({ ...settings, ...patch });

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) onClose();
      }}
      onCancel={(event) => event.preventDefault()}
      onClose={() => {
        // The browser closed it on its own (e.g. close-request abuse protection): sync the state.
        if (open) onClose();
      }}
    >
      {open && (
        <>
          <h2 id={titleId} className="settings-dialog__title">
            Settings
          </h2>
          <div className="settings-dialog__body">
            {mode === 'home' && (
              <>
                <ScaleCombobox value={settings.scaleId} onChange={(id) => onChange(selectScale(settings, id))} />
                <SettingSlider
                  label="Melody length"
                  min={MIN_MELODY_LENGTH}
                  max={MAX_MELODY_LENGTH}
                  step={MELODY_LENGTH_STEP}
                  value={settings.melodyLength}
                  valueText={formatMelodyLength(settings.melodyLength)}
                  onChange={(melodyLength) => update({ melodyLength })}
                />
                <SettingSlider
                  label="Max interval"
                  min={minMaxInterval(settings.scaleId)}
                  max={MAX_INTERVAL_LIMIT}
                  step={MAX_INTERVAL_STEP}
                  value={settings.maxInterval}
                  valueText={formatMaxInterval(settings.maxInterval)}
                  onChange={(maxInterval) => update({ maxInterval })}
                />
              </>
            )}
            <SettingSlider
              label="Note duration"
              min={MIN_NOTE_DURATION_MS}
              max={MAX_NOTE_DURATION_MS}
              step={NOTE_DURATION_STEP_MS}
              value={settings.noteDurationMs}
              valueText={formatNoteDuration(settings.noteDurationMs)}
              onChange={(noteDurationMs) => update({ noteDurationMs })}
            />
            <SettingSlider
              label="Playback volume"
              min={volumeToPercent(MIN_VOLUME)}
              max={volumeToPercent(MAX_VOLUME)}
              step={VOLUME_STEP_PERCENT}
              value={volumeToPercent(settings.volume)}
              valueText={formatVolume(settings.volume)}
              onChange={(percent) => update({ volume: percentToVolume(percent) })}
            />
            {mode === 'training' && <p className="settings-dialog__hint">{TRAINING_HINT}</p>}
          </div>
          <div className="settings-dialog__footer">
            <button
              type="button"
              className="button"
              onClick={() => onChange(resetSettings(settings, mode === 'home' ? 'all' : 'training'))}
            >
              Reset to defaults
            </button>
            <button type="button" className="button button--primary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
