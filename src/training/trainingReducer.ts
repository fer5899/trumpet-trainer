import type { Exercise } from '../music/melody';
import type { Melody } from '../music/notes';
import { spellExercise } from '../music/spelling';

export type TrainingPhase = 'playing' | 'guard' | 'listening' | 'complete';

export interface TrainingState {
  phase: TrainingPhase;
  /** Written MIDI (= exercise.notes), MIN_MELODY_LENGTH..MAX_MELODY_LENGTH notes. */
  melody: Melody;
  /** spellExercise(exercise), computed once: key signature for scales, contextual for chromatic. */
  names: readonly string[];
  /** 0..melody.length; also the active index while < length. */
  matchedCount: number;
}

export type TrainingAction =
  | { type: 'playbackEnded' }
  | { type: 'guardElapsed' }
  | { type: 'noteMatched' }
  | { type: 'repeatRequested' };

export type NoteBoxState = 'pending' | 'active' | 'done';

export interface NoteBoxView {
  state: NoteBoxState;
  name: string | null;
}

export function createInitialTrainingState(exercise: Exercise): TrainingState {
  return { phase: 'playing', melody: exercise.notes, names: spellExercise(exercise), matchedCount: 0 };
}

/** Pure state machine. Any phase/action pair not listed in the PRD returns `state` unchanged. */
export function trainingReducer(state: TrainingState, action: TrainingAction): TrainingState {
  switch (state.phase) {
    case 'playing':
      return action.type === 'playbackEnded' ? { ...state, phase: 'guard' } : state;
    case 'guard':
      return action.type === 'guardElapsed' ? { ...state, phase: 'listening' } : state;
    case 'listening':
      if (action.type === 'repeatRequested') return { ...state, phase: 'playing' };
      if (action.type === 'noteMatched') {
        const matchedCount = state.matchedCount + 1;
        return {
          ...state,
          matchedCount,
          phase: matchedCount >= state.melody.length ? 'complete' : 'listening',
        };
      }
      return state;
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

export function selectCanAct(state: TrainingState): boolean {
  return state.phase === 'listening';
}
