import type { MicrophoneErrorKind } from '../audio/microphone';
import { MicLevelMeter } from './MicLevelMeter';
import { micErrorMessage } from './micErrorMessage';

export interface HomeScreenProps {
  onStart(): void;
  starting: boolean;
  startError: MicrophoneErrorKind | null;
  thresholdDb: number;
  onThresholdChange(db: number): void;
  testMicActive: boolean;
  onTestMicActiveChange(active: boolean): void;
  testMicError: MicrophoneErrorKind | null;
  onTestMicErrorChange(error: MicrophoneErrorKind | null): void;
}

export function HomeScreen({
  onStart,
  starting,
  startError,
  thresholdDb,
  onThresholdChange,
  testMicActive,
  onTestMicActiveChange,
  testMicError,
  onTestMicErrorChange,
}: HomeScreenProps): JSX.Element {
  return (
    <div className="home">
      <h1>Trumpet Trainer</h1>
      <button type="button" className="button button--primary" onClick={onStart} disabled={starting}>
        Start training
      </button>
      {startError !== null && (
        <p className="error" role="alert">
          {micErrorMessage(startError)}
        </p>
      )}
      <MicLevelMeter
        active={testMicActive}
        onActiveChange={onTestMicActiveChange}
        thresholdDb={thresholdDb}
        onThresholdChange={onThresholdChange}
        error={testMicError}
        onErrorChange={onTestMicErrorChange}
        disabled={starting}
      />
    </div>
  );
}
