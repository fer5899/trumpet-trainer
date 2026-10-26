import type { MicrophoneSession } from '../audio/microphone';
import type { Exercise } from '../music/melody';
import type { TrainingState } from '../training/trainingReducer';
import { useTrainingSession } from '../training/useTrainingSession';
import { NoteBox } from './NoteBox';
import { NoteRevealOverlay } from './NoteRevealOverlay';
import { PitchGraph } from './PitchGraph';

export interface TrainingScreenProps {
  exercise: Exercise;
  mic: MicrophoneSession;
  thresholdDb: number;
  /** Live settings, forwarded to useTrainingSession. */
  noteDurationMs: number;
  volume: number;
  onExit(): void;
}

function yourTurn({ matchedCount, melody }: TrainingState): string {
  return `Your turn: play note ${matchedCount + 1} of ${melody.length}`;
}

function statusText(state: TrainingState): string {
  switch (state.phase) {
    case 'playing':
      return 'Listen…';
    case 'guard':
      return 'Get ready…';
    case 'listening':
      return yourTurn(state);
    case 'reveal':
      // matchedCount is already incremented: the status advances as soon as the note is accepted.
      return state.matchedCount === state.melody.length ? 'Well done!' : yourTurn(state);
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
  const { state, boxes, canRepeat, canGiveUp, repeat, giveUp, graph, revealedName } = useTrainingSession({
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
        <button type="button" className="button" onClick={repeat} disabled={!canRepeat}>
          Repeat melody
        </button>
        <button type="button" className="button" onClick={giveUp} disabled={!canGiveUp}>
          Give up
        </button>
      </div>
      {/* Always rendered (every phase) so nothing jumps; only the graph re-renders per frame. */}
      <PitchGraph store={graph} />
      <NoteRevealOverlay name={revealedName} />
    </div>
  );
}
