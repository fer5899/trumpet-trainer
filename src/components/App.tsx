import { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAudioServices } from '../audio/AudioServicesContext';
import { MicrophoneError, type MicrophoneErrorKind, type MicrophoneSession } from '../audio/microphone';
import type { Settings } from '../config/settings';
import { loadSettings, loadThreshold, saveSettings, saveThreshold } from '../config/settingsStorage';
import { generateExercise, type Exercise } from '../music/melody';
import { getTestExercise } from '../testing/testMelody';
import { HomeScreen } from './HomeScreen';
import { SettingsButton } from './SettingsButton';
import { SettingsDialog } from './SettingsDialog';
import { TrainingScreen } from './TrainingScreen';

export interface AppProps {
  /** `getBrowserStorage()` in main.tsx; a fake (or null) in tests. Only settingsStorage touches it. */
  storage: Storage | null;
}

type Screen = { name: 'home' } | { name: 'training'; exercise: Exercise; mic: MicrophoneSession };

/** Root: Home ⇄ Training, plus the Settings dialog. Settings and the threshold are persisted to `storage`. */
export function App({ storage }: AppProps): JSX.Element {
  const services = useAudioServices();
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage));
  const [thresholdDb, setThresholdDb] = useState(() => loadThreshold(storage));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testMicActive, setTestMicActive] = useState(false);
  const [testMicError, setTestMicError] = useState<MicrophoneErrorKind | null>(null);
  const [startError, setStartError] = useState<MicrophoneErrorKind | null>(null);
  const [starting, setStarting] = useState(false);

  const handleSettingsChange = (next: Settings): void => {
    setSettings(next);
    saveSettings(storage, next);
  };

  const handleThresholdChange = (db: number): void => {
    setThresholdDb(db);
    saveThreshold(storage, db);
  };

  const handleStart = async (): Promise<void> => {
    // 1. Synchronously, before any await (iOS Safari autoplay policy).
    services.unlock();
    // 2. Commit synchronously so MicLevelMeter releases the test session before the new one opens.
    //    A stale test-mic error is cleared too, so at most one alert is shown.
    flushSync(() => {
      setStartError(null);
      setTestMicError(null);
      setTestMicActive(false);
      setStarting(true);
    });
    // 3. Open the training session.
    let mic: MicrophoneSession;
    try {
      mic = await services.openMicrophone();
    } catch (err) {
      setStartError(err instanceof MicrophoneError ? err.kind : 'unknown');
      setStarting(false);
      return;
    }
    // 4. Generate (or, in the e2e build, read) the exercise with the current settings and switch
    //    screens. The test mic stays off so returning Home never reopens it without a click.
    const exercise =
      getTestExercise(settings.scaleId) ??
      generateExercise(Math.random, {
        length: settings.melodyLength,
        maxInterval: settings.maxInterval,
        scaleId: settings.scaleId,
      });
    setTestMicActive(false);
    setScreen({ name: 'training', exercise, mic });
    setStarting(false);
  };

  const handleExit = useCallback(() => setScreen({ name: 'home' }), []);

  return (
    <main className="app">
      <div className="app__toolbar">
        <SettingsButton onClick={() => setSettingsOpen(true)} disabled={starting} />
      </div>
      {screen.name === 'training' ? (
        <TrainingScreen
          exercise={screen.exercise}
          mic={screen.mic}
          thresholdDb={thresholdDb}
          noteDurationMs={settings.noteDurationMs}
          volume={settings.volume}
          onExit={handleExit}
        />
      ) : (
        <HomeScreen
          onStart={() => void handleStart()}
          starting={starting}
          startError={startError}
          thresholdDb={thresholdDb}
          onThresholdChange={handleThresholdChange}
          testMicActive={testMicActive}
          onTestMicActiveChange={setTestMicActive}
          testMicError={testMicError}
          onTestMicErrorChange={setTestMicError}
        />
      )}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mode={screen.name === 'training' ? 'training' : 'home'}
        settings={settings}
        onChange={handleSettingsChange}
      />
    </main>
  );
}
