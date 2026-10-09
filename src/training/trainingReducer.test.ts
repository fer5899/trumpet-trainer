import { describe, expect, it } from 'vitest';
import type { Exercise } from '../music/melody';
import { spellInKey, spellMelody } from '../music/spelling';
import { requireSpecificScale } from '../test/scales';
import {
  createInitialTrainingState,
  selectCanAct,
  selectNoteBoxes,
  trainingReducer,
  type TrainingAction,
  type TrainingPhase,
  type TrainingState,
} from './trainingReducer';

const MELODY = [54, 61, 61, 58, 72] as const;
const EXERCISE: Exercise = { notes: MELODY, scale: 'chromatic' };

function stateIn(phase: TrainingPhase, matchedCount = 0): TrainingState {
  return { ...createInitialTrainingState(EXERCISE), phase, matchedCount };
}

const ACTIONS: TrainingAction[] = [
  { type: 'playbackEnded' },
  { type: 'guardElapsed' },
  { type: 'noteMatched' },
  { type: 'repeatRequested' },
];
const PHASES: TrainingPhase[] = ['playing', 'guard', 'listening', 'complete'];
const VALID = new Set(['playing:playbackEnded', 'guard:guardElapsed', 'listening:noteMatched', 'listening:repeatRequested']);

describe('createInitialTrainingState', () => {
  it('starts playing with nothing matched and the contextual names for a chromatic exercise', () => {
    const state = createInitialTrainingState(EXERCISE);
    expect(state.phase).toBe('playing');
    expect(state.matchedCount).toBe(0);
    expect(state.melody).toEqual(MELODY);
    expect(state.names).toEqual(spellMelody(MELODY));
    expect(state.names).toEqual(['Fa#3', 'Do#4', 'Do#4', 'Si♭3', 'Do5']);
  });

  it('spells a scale exercise in its key (Fa major shows Si♭)', () => {
    const scale = requireSpecificScale('major:fa');
    const notes = [65, 70, 69, 72] as const;
    const state = createInitialTrainingState({ notes, scale });
    expect(state.melody).toEqual(notes);
    expect(state.names).toEqual(spellInKey(notes, scale.keySignature));
    expect(state.names).toEqual(['Fa4', 'Si♭4', 'La4', 'Do5']);
  });

  it.each([3, 8])('keeps a %i-note exercise; the last match completes it', (length) => {
    const notes = Array.from({ length }, () => 60);
    let state: TrainingState = { ...createInitialTrainingState({ notes, scale: 'chromatic' }), phase: 'listening' };
    expect(selectNoteBoxes(state)).toHaveLength(length);
    for (let i = 0; i < length; i += 1) state = trainingReducer(state, { type: 'noteMatched' });
    expect(state.phase).toBe('complete');
    expect(state.matchedCount).toBe(length);
  });
});

describe('trainingReducer transitions', () => {
  it.each([
    ['playing', 'playbackEnded', 'guard'],
    ['guard', 'guardElapsed', 'listening'],
    ['listening', 'repeatRequested', 'playing'],
  ] as const)('%s + %s → %s', (from, type, to) => {
    const before = stateIn(from, 2);
    const after = trainingReducer(before, { type });
    expect(after).not.toBe(before);
    expect(after.phase).toBe(to);
    expect(after.matchedCount).toBe(2);
    expect(after.names).toBe(before.names);
    expect(after.melody).toBe(before.melody);
  });

  it.each([0, 1, 2, 3])('listening + noteMatched with %i matched increments and keeps listening', (n) => {
    const after = trainingReducer(stateIn('listening', n), { type: 'noteMatched' });
    expect(after.phase).toBe('listening');
    expect(after.matchedCount).toBe(n + 1);
  });

  it('the 5th noteMatched completes the exercise', () => {
    const after = trainingReducer(stateIn('listening', 4), { type: 'noteMatched' });
    expect(after.phase).toBe('complete');
    expect(after.matchedCount).toBe(5);
  });

  it('repeatRequested keeps matchedCount', () => {
    expect(trainingReducer(stateIn('listening', 3), { type: 'repeatRequested' }).matchedCount).toBe(3);
  });

  const ignored = PHASES.flatMap((phase) =>
    ACTIONS.filter((a) => !VALID.has(`${phase}:${a.type}`)).map((a) => [phase, a.type] as const),
  );
  it.each(ignored)('%s + %s is ignored (same reference)', (phase, type) => {
    const before = stateIn(phase, 1);
    expect(trainingReducer(before, { type })).toBe(before);
  });

  it('covers 12 ignored phase/action pairs', () => {
    expect(ignored).toHaveLength(12);
  });
});

describe('selectNoteBoxes', () => {
  it('first box active, others pending, at the start', () => {
    expect(selectNoteBoxes(stateIn('playing', 0))).toEqual([
      { state: 'active', name: null },
      { state: 'pending', name: null },
      { state: 'pending', name: null },
      { state: 'pending', name: null },
      { state: 'pending', name: null },
    ]);
  });

  it.each(['playing', 'guard', 'listening'] as const)('done boxes show names and the next is active in %s', (phase) => {
    expect(selectNoteBoxes(stateIn(phase, 2))).toEqual([
      { state: 'done', name: 'Fa#3' },
      { state: 'done', name: 'Do#4' },
      { state: 'active', name: null },
      { state: 'pending', name: null },
      { state: 'pending', name: null },
    ]);
  });

  it('all done when complete', () => {
    const boxes = selectNoteBoxes(stateIn('complete', 5));
    expect(boxes.map((b) => b.state)).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(boxes.map((b) => b.name)).toEqual(['Fa#3', 'Do#4', 'Do#4', 'Si♭3', 'Do5']);
  });
});

describe('selectCanAct', () => {
  it.each([
    ['playing', false],
    ['guard', false],
    ['listening', true],
    ['complete', false],
  ] as const)('%s → %s', (phase, expected) => {
    expect(selectCanAct(stateIn(phase))).toBe(expected);
  });
});
