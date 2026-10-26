export interface NoteRevealOverlayProps {
  /** The revealed note name exactly as in its note box (state.names[i], e.g. "Fa#3"); null = hidden. */
  name: string | null;
}

/**
 * Large card with the name of the note just guessed, over a dimmed, blurred screen. The
 * role="status" region is always mounted so inserting the card announces the name once. Both
 * layers ignore the pointer (Give up stays clickable); the component has no timer: it shows
 * whatever name it gets (the `reveal` phase).
 */
export function NoteRevealOverlay({ name }: NoteRevealOverlayProps): JSX.Element {
  return (
    <div className="note-reveal" role="status" data-testid="note-reveal-region">
      {name !== null && (
        <>
          <div className="note-reveal__backdrop" aria-hidden="true" />
          <p className="note-reveal__card" data-testid="note-reveal">
            {name}
          </p>
        </>
      )}
    </div>
  );
}
