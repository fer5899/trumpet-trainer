import { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAudioServices } from '../audio/AudioServicesContext';
import { MicrophoneError, type MicrophoneErrorKind, type MicrophoneSession } from '../audio/microphone';
import { DEFAULT_MELODY_LENGTH, DEFAULT_THRESHOLD_DB, MAX_INTERVAL_LIMIT } from '../config/constants';
import { generateExercise } from '../music/melody';
import type { Melody } from '../music/notes';
import { CHROMATIC_ID } from '../music/scales';
import { getTestMelody } from '../testing/testMelody';
import { HomeScreen } from './HomeScreen';
import { TrainingScreen } from './TrainingScreen';

type Screen = { name: 'home' } | { name: 'training'; melody: Melody; mic: MicrophoneSession };

/** Root: Home ⇄ Training. All state is in memory only (nothing is persisted). */
export function App(): JSX.Element {
  const services = useAudioServices();
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [thresholdDb, setThresholdDb] = useState(DEFAULT_THRESHOLD_DB);
  const [testMicActive, setTestMicActive] = useState(false);
  const [testMicError, setTestMicError] = useState<MicrophoneErrorKind | null>(null);
  const [startError, setStartError] = useState<MicrophoneErrorKind | null>(null);
  const [starting, setStarting] = useState(false);

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
    // 4. Generate (or, in the e2e build, read) the melody and switch screens.
    //    The test mic stays off so returning Home never reopens it without a click.
    //    Until the settings UI lands, a chromatic exercise with the widest interval reproduces the
    //    MVP melodies exactly.
    const melody =
      getTestMelody() ??
      generateExercise(Math.random, {
        length: DEFAULT_MELODY_LENGTH,
        maxInterval: MAX_INTERVAL_LIMIT,
        scaleId: CHROMATIC_ID,
      }).notes;
    setTestMicActive(false);
    setScreen({ name: 'training', melody, mic });
    setStarting(false);
  };

  const handleExit = useCallback(() => setScreen({ name: 'home' }), []);

  return (
    <main className="app">
      {screen.name === 'training' ? (
        <TrainingScreen melody={screen.melody} mic={screen.mic} thresholdDb={thresholdDb} onExit={handleExit} />
      ) : (
        <HomeScreen
          onStart={() => void handleStart()}
          starting={starting}
          startError={startError}
          thresholdDb={thresholdDb}
          onThresholdChange={setThresholdDb}
          testMicActive={testMicActive}
          onTestMicActiveChange={setTestMicActive}
          testMicError={testMicError}
          onTestMicErrorChange={setTestMicError}
        />
      )}
    </main>
  );
}
