import type { MicrophoneSession } from '../audio/microphone';
import type { Exercise } from '../music/melody';
import type { TrainingState } from '../training/trainingReducer';
import { useTrainingSession } from '../training/useTrainingSession';
import { NoteBox } from './NoteBox';

export interface TrainingScreenProps {
  exercise: Exercise;
  mic: MicrophoneSession;
  thresholdDb: number;
  /** Live settings, forwarded to useTrainingSession. */
  noteDurationMs: number;
  volume: number;
  onExit(): void;
}

function statusText({ phase, matchedCount, melody }: TrainingState): string {
  switch (phase) {
    case 'playing':
      return 'Listen…';
    case 'guard':
      return 'Get ready…';
    case 'listening':
      return `Your turn: play note ${matchedCount + 1} of ${melody.length}`;
    case 'complete':
      return 'Well done!';
  }
}

export function TrainingScreen({
  exercise,
  mic,
  thresholdDb,
  noteDurationMs,
  volume,
  onExit,
}: TrainingScreenProps): JSX.Element {
  const { state, boxes, canAct, repeat, giveUp } = useTrainingSession({
    exercise,
    mic,
    thresholdDb,
    noteDurationMs,
    volume,
    onExit,
  });
  return (
    <div className="training">
      <p className="training__status" data-testid="training-status" aria-live="polite">
        {statusText(state)}
      </p>
      <ol className="note-boxes" aria-label="Melody notes">
        {boxes.map((box, index) => (
          <NoteBox key={index} index={index} state={box.state} name={box.name} />
        ))}
      </ol>
      <div className="training__actions">
        <button type="button" className="button" onClick={repeat} disabled={!canAct}>
          Repeat melody
        </button>
        <button type="button" className="button" onClick={giveUp} disabled={!canAct}>
          Give up
        </button>
      </div>
    </div>
  );
}
