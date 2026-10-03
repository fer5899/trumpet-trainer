import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useAudioServices } from '../audio/AudioServicesContext';
import { computeLevelDb } from '../audio/level';
import { MicrophoneError, type MicrophoneErrorKind, type MicrophoneSession } from '../audio/microphone';
import { METER_MAX_DB, METER_MIN_DB, THRESHOLD_STEP_DB } from '../config/constants';
import { micErrorMessage } from './micErrorMessage';

export interface MicLevelMeterProps {
  active: boolean;
  onActiveChange(active: boolean): void;
  thresholdDb: number;
  onThresholdChange(db: number): void;
  /** Last test-microphone failure, owned by the parent so Start can clear it (one alert at a time). */
  error: MicrophoneErrorKind | null;
  onErrorChange(error: MicrophoneErrorKind | null): void;
  /** Disables the toggle (e.g. while Start is opening the training microphone). */
  disabled?: boolean;
}

const PERCENT = 100;
const METER_SPAN_DB = METER_MAX_DB - METER_MIN_DB;
const MINUS_SIGN = '−';

const clampToMeter = (db: number): number => Math.min(METER_MAX_DB, Math.max(METER_MIN_DB, db));
/** The value the meter shows: whole dB within the meter range. */
const toDisplayDb = (db: number): number => Math.round(clampToMeter(db));
const toPercent = (db: number): number => ((clampToMeter(db) - METER_MIN_DB) / METER_SPAN_DB) * PERCENT;
/** "−40" with a typographic minus sign. */
const formatDb = (db: number): string => (db < 0 ? `${MINUS_SIGN}${Math.abs(db)}` : `${db}`);

/**
 * "Test microphone" toggle plus a live level bar with the threshold slider overlaid on it.
 * While active it holds its own microphone session, released when turned off or unmounted.
 */
export function MicLevelMeter({
  active,
  onActiveChange,
  thresholdDb,
  onThresholdChange,
  error,
  onErrorChange,
  disabled = false,
}: MicLevelMeterProps): JSX.Element {
  const services = useAudioServices();
  // Stored already rounded and clamped, and only set when it changes, so a steady or silent
  // input does not re-render the meter on every animation frame.
  const [levelDb, setLevelDb] = useState(METER_MIN_DB);
  const callbacksRef = useRef({ onActiveChange, onErrorChange });
  useEffect(() => {
    callbacksRef.current = { onActiveChange, onErrorChange };
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let session: MicrophoneSession | null = null;
    let unsubscribe: (() => void) | null = null;

    services.openMicrophone().then(
      (opened) => {
        if (cancelled) {
          opened.release();
          return;
        }
        session = opened;
        let shown = METER_MIN_DB;
        unsubscribe = opened.subscribe(({ samples }) => {
          const next = toDisplayDb(computeLevelDb(samples));
          if (next === shown) return;
          shown = next;
          setLevelDb(next);
        });
      },
      (err: unknown) => {
        if (cancelled) return;
        callbacksRef.current.onErrorChange(err instanceof MicrophoneError ? err.kind : 'unknown');
        callbacksRef.current.onActiveChange(false);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
      session?.release();
      setLevelDb(METER_MIN_DB);
    };
  }, [active, services]);

  const handleToggle = (): void => {
    if (active) {
      onActiveChange(false);
      return;
    }
    services.unlock(); // synchronous, inside the click handler (iOS autoplay policy)
    onErrorChange(null);
    onActiveChange(true);
  };

  const shownDb = active ? levelDb : METER_MIN_DB;
  const aboveThreshold = active && levelDb >= thresholdDb;

  return (
    <section className="mic-meter" aria-label="Microphone test">
      <button
        type="button"
        className="mic-meter__toggle"
        aria-pressed={active}
        disabled={disabled}
        onClick={handleToggle}
      >
        Test microphone
      </button>
      <div className="mic-meter__bar">
        <div
          className="mic-meter__track"
          role="meter"
          aria-label="Microphone level"
          aria-valuemin={METER_MIN_DB}
          aria-valuemax={METER_MAX_DB}
          aria-valuenow={shownDb}
        >
          <div
            data-testid="mic-level-fill"
            className={`mic-meter__fill${aboveThreshold ? ' mic-meter__fill--ok' : ''}`}
            style={{ width: `${toPercent(shownDb)}%` }}
          />
        </div>
        <input
          className="mic-meter__slider"
          type="range"
          aria-label="Threshold"
          min={METER_MIN_DB}
          max={METER_MAX_DB}
          step={THRESHOLD_STEP_DB}
          value={thresholdDb}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onThresholdChange(Number(e.target.value))}
        />
      </div>
      <div className="mic-meter__scale">
        <span>{formatDb(METER_MIN_DB)} dB</span>
        <span className="mic-meter__threshold-label">Threshold: {formatDb(thresholdDb)} dB</span>
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {micErrorMessage(error)}
        </p>
      )}
    </section>
  );
}
