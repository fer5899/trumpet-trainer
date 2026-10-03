import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoteBox } from './NoteBox';

describe('NoteBox', () => {
  it.each([
    [0, 'pending', null, 'Note 1: pending', ''],
    [2, 'active', null, 'Note 3: active', ''],
    [4, 'done', 'Si♭3', 'Note 5: done Si♭3', 'Si♭3'],
  ] as const)('index %i %s', (index, state, name, label, text) => {
    render(<NoteBox index={index} state={state} name={name} />);
    const box = screen.getByTestId(`note-box-${index}`);
    expect(box).toHaveAttribute('data-state', state);
    expect(box).toHaveAccessibleName(label);
    expect(box).toHaveTextContent(text);
    expect(box).toHaveClass(`note-box--${state}`);
  });
});
