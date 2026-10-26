import { describe, expect, it } from 'vitest';
import type { Exercise } from '../music/melody';
import { spellInKey, spellMelody } from '../music/spelling';
import { requireSpecificScale } from '../test/scales';
import {
  createInitialTrainingState,
  selectCanGiveUp,
  selectCanRepeat,
  selectExpectedNote,
  selectNoteBoxes,
  selectRevealedName,
  trainingReducer,
  type TrainingAction,
  type TrainingPhase,
  type TrainingState,
} from './trainingReducer';

const MELODY = [54, 61, 61, 58, 72] as const;
const EXERCISE: Exercise = { notes: MELODY, scale: 'chromatic' };

function stateIn(phase: TrainingPhase, matchedCount = 0, wrongNotes: readonly number[] = []): TrainingState {
  return { ...createInitialTrainingState(EXERCISE), phase, matchedCount, wrongNotes };
}

const ACTIONS: TrainingAction[] = [
  { type: 'playbackEnded' },
  { type: 'guardElapsed' },
  { type: 'noteMatched' },
  { type: 'wrongNoteHeld', midi: 70 },
  { type: 'revealElapsed' },
  { type: 'repeatRequested' },
];
const PHASES: TrainingPhase[] = ['playing', 'guard', 'listening', 'reveal', 'complete'];
const VALID = new Set([
  'playing:playbackEnded',
  'guard:guardElapsed',
  'listening:noteMatched',
  'listening:wrongNoteHeld',
  'listening:repeatRequested',
  'reveal:revealElapsed',
]);

describe('createInitialTrainingState', () => {
  it('starts playing with nothing matched and the contextual names for a chromatic exercise', () => {
    const state = createInitialTrainingState(EXERCISE);
    expect(state.phase).toBe('playing');
    expect(state.matchedCount).toBe(0);
    expect(state.wrongNotes).toEqual([]);
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

  it.each([3, 8])('keeps a %i-note exercise; the last match + reveal completes it', (length) => {
    const notes = Array.from({ length }, () => 60);
    let state: TrainingState = { ...createInitialTrainingState({ notes, scale: 'chromatic' }), phase: 'listening' };
    expect(selectNoteBoxes(state)).toHaveLength(length);
    for (let i = 0; i < length; i += 1) {
      state = trainingReducer(state, { type: 'noteMatched' });
      expect(state.phase).toBe('reveal');
      state = trainingReducer(state, { type: 'revealElapsed' });
    }
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

  it.each([0, 1, 2, 3, 4])('listening + noteMatched with %i matched → reveal, +1, red marks cleared', (n) => {
    const before = stateIn('listening', n, [70, 66]);
    const after = trainingReducer(before, { type: 'noteMatched' });
    expect(after.phase).toBe('reveal');
    expect(after.matchedCount).toBe(n + 1);
    expect(after.wrongNotes).toEqual([]);
    expect(after.names).toBe(before.names);
    expect(after.melody).toBe(before.melody);
  });

  it.each([1, 2, 3, 4])('reveal + revealElapsed with %i matched → listening', (n) => {
    const before = stateIn('reveal', n);
    const after = trainingReducer(before, { type: 'revealElapsed' });
    expect(after.phase).toBe('listening');
    expect(after.matchedCount).toBe(n);
    expect(after.names).toBe(before.names);
    expect(after.melody).toBe(before.melody);
  });

  it('reveal + revealElapsed after the 5th match completes the exercise', () => {
    const after = trainingReducer(stateIn('reveal', 5), { type: 'revealElapsed' });
    expect(after.phase).toBe('complete');
    expect(after.matchedCount).toBe(5);
  });

  it('repeatRequested keeps matchedCount and wrongNotes', () => {
    const before = stateIn('listening', 3, [70, 66]);
    const after = trainingReducer(before, { type: 'repeatRequested' });
    expect(after.matchedCount).toBe(3);
    expect(after.wrongNotes).toBe(before.wrongNotes);
  });

  it('wrongNoteHeld appends in insertion order and stays listening', () => {
    let state = stateIn('listening', 0);
    state = trainingReducer(state, { type: 'wrongNoteHeld', midi: 70 });
    expect(state.phase).toBe('listening');
    expect(state.wrongNotes).toEqual([70]);
    state = trainingReducer(state, { type: 'wrongNoteHeld', midi: 57 });
    expect(state.wrongNotes).toEqual([70, 57]);
    expect(state.matchedCount).toBe(0);
  });

  it('wrongNoteHeld ignores a duplicate (same reference)', () => {
    const before = stateIn('listening', 0, [70]);
    expect(trainingReducer(before, { type: 'wrongNoteHeld', midi: 70 })).toBe(before);
  });

  it('wrongNoteHeld ignores the expected note (same reference)', () => {
    // MELODY[1] = written 61 → concert 59.
    const before = stateIn('listening', 1);
    expect(selectExpectedNote(before)).toBe(59);
    expect(trainingReducer(before, { type: 'wrongNoteHeld', midi: 59 })).toBe(before);
  });

  const ignored = PHASES.flatMap((phase) =>
    ACTIONS.filter((a) => !VALID.has(`${phase}:${a.type}`)).map((a) => [phase, a.type] as const),
  );
  it.each(ignored)('%s + %s is ignored (same reference)', (phase, type) => {
    const before = stateIn(phase, 1);
    const action = ACTIONS.find((a) => a.type === type);
    if (!action) throw new Error(`unknown action ${type}`);
    expect(trainingReducer(before, action)).toBe(before);
  });

  it('covers 24 ignored phase/action pairs', () => {
    expect(ignored).toHaveLength(24);
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

  it('in reveal the matched box is done with its name and the next is active', () => {
    expect(selectNoteBoxes(stateIn('reveal', 1))).toEqual([
      { state: 'done', name: 'Fa#3' },
      { state: 'active', name: null },
      { state: 'pending', name: null },
      { state: 'pending', name: null },
      { state: 'pending', name: null },
    ]);
  });

  it('in reveal after the last match every box is done', () => {
    expect(selectNoteBoxes(stateIn('reveal', 5)).map((b) => b.state)).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  it('all done when complete', () => {
    const boxes = selectNoteBoxes(stateIn('complete', 5));
    expect(boxes.map((b) => b.state)).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(boxes.map((b) => b.name)).toEqual(['Fa#3', 'Do#4', 'Do#4', 'Si♭3', 'Do5']);
  });
});

describe('selectCanRepeat / selectCanGiveUp', () => {
  it.each([
    ['playing', false, false],
    ['guard', false, false],
    ['listening', true, true],
    ['reveal', false, true],
    ['complete', false, false],
  ] as const)('%s → repeat %s, give up %s', (phase, canRepeat, canGiveUp) => {
    expect(selectCanRepeat(stateIn(phase, 1))).toBe(canRepeat);
    expect(selectCanGiveUp(stateIn(phase, 1))).toBe(canGiveUp);
  });
});

describe('selectRevealedName', () => {
  it.each(['playing', 'guard', 'listening', 'complete'] as const)('is null in %s', (phase) => {
    expect(selectRevealedName(stateIn(phase, 2))).toBeNull();
  });

  it.each([
    [1, 'Fa#3'],
    [2, 'Do#4'],
    [5, 'Do5'],
  ])('is the matched note name in reveal (%i matched → %s)', (n, name) => {
    expect(selectRevealedName(stateIn('reveal', n))).toBe(name);
  });
});

describe('selectExpectedNote', () => {
  it.each(['playing', 'guard', 'listening', 'reveal'] as const)('is the concert pitch of the active note in %s', (phase) => {
    expect(selectExpectedNote(stateIn(phase, 0))).toBe(52);
    expect(selectExpectedNote(stateIn(phase, 4))).toBe(70);
  });

  it('is null once every note is matched', () => {
    expect(selectExpectedNote(stateIn('reveal', 5))).toBeNull();
    expect(selectExpectedNote(stateIn('complete', 5))).toBeNull();
  });
});
