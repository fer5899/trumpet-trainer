import type { NoteBoxState } from '../training/trainingReducer';

export interface NoteBoxProps {
  index: number;
  state: NoteBoxState;
  name: string | null;
}

/** One melody note: grey (pending), grey + highlighted border (active) or green with its name (done). */
export function NoteBox({ index, state, name }: NoteBoxProps): JSX.Element {
  const description = state === 'done' ? `done ${name ?? ''}`.trim() : state;
  return (
    <li
      className={`note-box note-box--${state}`}
      data-testid={`note-box-${index}`}
      data-state={state}
      aria-label={`Note ${index + 1}: ${description}`}
    >
      {state === 'done' ? name : null}
    </li>
  );
}
