import type { Exercise } from '../music/melody';
import { writtenToConcert, type ConcertMidi, type Melody } from '../music/notes';
import { spellExercise } from '../music/spelling';

export type TrainingPhase = 'playing' | 'guard' | 'listening' | 'reveal' | 'complete';

export interface TrainingState {
  phase: TrainingPhase;
  /** Written MIDI (= exercise.notes), MIN_MELODY_LENGTH..MAX_MELODY_LENGTH notes. */
  melody: Melody;
  /** spellExercise(exercise), computed once: key signature for scales, contextual for chromatic. */
  names: readonly string[];
  /** 0..melody.length; also the active index while < length. Incremented when the reveal starts. */
  matchedCount: number;
  /** Concert notes (integers) held to completion that are not the current expected note. Insertion order, no duplicates. */
  wrongNotes: readonly ConcertMidi[];
}

export type TrainingAction =
  | { type: 'playbackEnded' }
  | { type: 'guardElapsed' }
  | { type: 'noteMatched' }
  | { type: 'wrongNoteHeld'; midi: ConcertMidi }
  | { type: 'revealElapsed' }
  | { type: 'repeatRequested' };

export type NoteBoxState = 'pending' | 'active' | 'done';

export interface NoteBoxView {
  state: NoteBoxState;
  name: string | null;
}

export function createInitialTrainingState(exercise: Exercise): TrainingState {
  return { phase: 'playing', melody: exercise.notes, names: spellExercise(exercise), matchedCount: 0, wrongNotes: [] };
}

/** writtenToConcert(melody[matchedCount]), or null when every note is matched. */
export function selectExpectedNote(state: TrainingState): ConcertMidi | null {
  return state.matchedCount < state.melody.length ? writtenToConcert(state.melody[state.matchedCount]) : null;
}

/** Pure state machine. Any phase/action pair not listed in the PRD returns `state` unchanged. */
export function trainingReducer(state: TrainingState, action: TrainingAction): TrainingState {
  switch (state.phase) {
    case 'playing':
      return action.type === 'playbackEnded' ? { ...state, phase: 'guard' } : state;
    case 'guard':
      return action.type === 'guardElapsed' ? { ...state, phase: 'listening' } : state;
    case 'listening':
      switch (action.type) {
        case 'repeatRequested':
          return { ...state, phase: 'playing' };
        case 'noteMatched':
          return { ...state, phase: 'reveal', matchedCount: state.matchedCount + 1, wrongNotes: [] };
        case 'wrongNoteHeld':
          // Invariant: no duplicates, and the expected note is never red.
          if (state.wrongNotes.includes(action.midi) || action.midi === selectExpectedNote(state)) return state;
          return { ...state, wrongNotes: [...state.wrongNotes, action.midi] };
        default:
          return state;
      }
    case 'reveal':
      if (action.type !== 'revealElapsed') return state;
      return { ...state, phase: state.matchedCount >= state.melody.length ? 'complete' : 'listening' };
    case 'complete':
      return state;
  }
}

export function selectNoteBoxes(state: TrainingState): NoteBoxView[] {
  return state.melody.map((_, i) => {
    if (i < state.matchedCount) return { state: 'done', name: state.names[i] };
    if (i === state.matchedCount && state.phase !== 'complete') return { state: 'active', name: null };
    return { state: 'pending', name: null };
  });
}

export function selectCanRepeat(state: TrainingState): boolean {
  return state.phase === 'listening';
}

export function selectCanGiveUp(state: TrainingState): boolean {
  return state.phase === 'listening' || state.phase === 'reveal';
}

/** names[matchedCount − 1] during 'reveal', else null. */
export function selectRevealedName(state: TrainingState): string | null {
  return state.phase === 'reveal' ? state.names[state.matchedCount - 1] : null;
}
