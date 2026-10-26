import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoteRevealOverlay } from './NoteRevealOverlay';

const region = () => screen.getByRole('status');
const card = () => screen.queryByTestId('note-reveal');

describe('NoteRevealOverlay', () => {
  it('null: an empty, always-mounted status region and no card', () => {
    const { container } = render(<NoteRevealOverlay name={null} />);
    expect(region()).toHaveAttribute('data-testid', 'note-reveal-region');
    expect(region()).toHaveClass('note-reveal');
    expect(region()).toBeEmptyDOMElement();
    expect(card()).toBeNull();
    expect(container.querySelector('.note-reveal__backdrop')).toBeNull();
  });

  it('a name: the card shows it inside the status region, the backdrop is aria-hidden', () => {
    const { container } = render(<NoteRevealOverlay name="Fa#3" />);
    expect(card()).toHaveTextContent('Fa#3');
    expect(card()).toHaveClass('note-reveal__card');
    expect(region()).toHaveTextContent(/^Fa#3$/);
    expect(region()).toContainElement(card());
    const backdrop = container.querySelector('.note-reveal__backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(region()).toContainElement(backdrop as HTMLElement);
  });

  it('keeps the same region element when the card appears and goes', () => {
    const { rerender } = render(<NoteRevealOverlay name={null} />);
    const before = region();
    rerender(<NoteRevealOverlay name="Si4" />);
    expect(region()).toBe(before);
    expect(card()).toHaveTextContent('Si4');
    rerender(<NoteRevealOverlay name={null} />);
    expect(region()).toBe(before);
    expect(card()).toBeNull();
    expect(region()).toBeEmptyDOMElement();
  });
});
