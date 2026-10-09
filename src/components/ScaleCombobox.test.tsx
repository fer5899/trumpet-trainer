import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getScaleOption, SCALE_OPTIONS, type ScaleOptionId } from '../music/scales';
import { ScaleCombobox } from './ScaleCombobox';

function setup(initial: ScaleOptionId = 'major:do') {
  const onChange = vi.fn<(id: ScaleOptionId) => void>();
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <>
        <ScaleCombobox
          value={value}
          onChange={(id) => {
            onChange(id);
            setValue(id);
          }}
        />
        <button type="button">Outside</button>
      </>
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  return { user, onChange };
}

const input = () => screen.getByRole('combobox', { name: 'Scale' });
const listbox = () => screen.getByRole('listbox', { name: 'Scales' });
const optionNames = () => within(listbox()).getAllByRole('option').map((o) => o.textContent);
const activeOption = () => {
  const id = input().getAttribute('aria-activedescendant');
  return id === null ? null : document.getElementById(id);
};

describe('ScaleCombobox — closed', () => {
  it('shows the selected option name, collapsed, with no listbox', () => {
    setup('minor:fa-sharp');
    expect(input()).toHaveValue(getScaleOption('minor:fa-sharp')!.name);
    expect(input()).toHaveValue('Fa# minor');
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).toHaveAttribute('aria-autocomplete', 'list');
    expect(input()).toHaveAttribute('autocomplete', 'off');
    expect(input()).toHaveAttribute('spellcheck', 'false');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('ScaleCombobox — open', () => {
  it('focus opens all 146 options in catalog order with the current value active and the text selected', async () => {
    const { user } = setup();
    await user.click(input());
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(input()).toHaveAttribute('aria-controls', listbox().id);
    expect(optionNames()).toHaveLength(146);
    expect(optionNames()).toEqual(SCALE_OPTIONS.map((o) => o.name));
    expect(activeOption()).toHaveTextContent('Do major');
    expect(activeOption()).toHaveAttribute('aria-selected', 'true');
    expect(within(listbox()).getAllByRole('option', { selected: true })).toHaveLength(1);
    const el = input() as HTMLInputElement;
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe('Do major'.length);
  });

  it('Tab focus also opens the list', async () => {
    const { user } = setup();
    await user.tab();
    expect(input()).toHaveFocus();
    expect(listbox()).toBeInTheDocument();
  });

  it('scrolls the active option into view when available', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const { user } = setup();
      await user.click(input());
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it('typing filters with searchScaleOptions and activates the first result', async () => {
    const { user } = setup();
    await user.click(input());
    await user.keyboard('bb major');
    expect(input()).toHaveValue('bb major');
    expect(optionNames()).toEqual(['Si♭ major', 'Si♭ major pentatonic']);
    expect(activeOption()).toHaveTextContent('Si♭ major');
  });

  it('no results: one disabled, unselected "No matching scales" and no active descendant', async () => {
    const { user, onChange } = setup();
    await user.click(input());
    await user.keyboard('xyz');
    const options = within(listbox()).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('No matching scales');
    expect(options[0]).toHaveAttribute('aria-disabled', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{Enter}');
    await user.click(options[0]);
    expect(onChange).not.toHaveBeenCalled();
    expect(listbox()).toBeInTheDocument();
  });

  it('ArrowDown / ArrowUp move the active option, clamped at both ends', async () => {
    const { user } = setup('chromatic');
    await user.click(input());
    expect(activeOption()).toHaveTextContent('Chromatic');
    await user.keyboard('{ArrowUp}');
    expect(activeOption()).toHaveTextContent('Chromatic');
    await user.keyboard('{ArrowDown}');
    expect(activeOption()).toHaveTextContent('All scales');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(activeOption()).toHaveTextContent(SCALE_OPTIONS[3].name);
    await user.keyboard('{ArrowUp}');
    expect(activeOption()).toHaveTextContent(SCALE_OPTIONS[2].name);

    await user.clear(input());
    await user.keyboard('bb major');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(activeOption()).toHaveTextContent('Si♭ major pentatonic');
  });

  it('Enter selects the active option, closes the list and shows its name', async () => {
    const { user, onChange } = setup();
    await user.click(input());
    await user.keyboard('bb major');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange.mock.calls).toEqual([['major-pentatonic:si-flat']]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).toHaveValue('Si♭ major pentatonic');
    expect(input()).toHaveFocus();
  });

  it('f# dorian + Enter selects Fa# dorian', async () => {
    const { user, onChange } = setup();
    await user.click(input());
    await user.keyboard('f# dorian{Enter}');
    expect(onChange.mock.calls).toEqual([['dorian:fa-sharp']]);
    expect(input()).toHaveValue('Fa# dorian');
  });

  it('clicking an option selects it and keeps focus on the input', async () => {
    const { user, onChange } = setup();
    await user.click(input());
    await user.click(within(listbox()).getByRole('option', { name: 'Sol major' }));
    expect(onChange.mock.calls).toEqual([['major:sol']]);
    expect(input()).toHaveValue('Sol major');
    expect(input()).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Escape with the list open closes the list, reverts the text and is prevented and not propagated', async () => {
    const parentKeyDown = vi.fn();
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <div onKeyDown={parentKeyDown}>
        <ScaleCombobox value="major:do" onChange={onChange} />
      </div>,
    );
    await user.click(input());
    await user.keyboard('bb');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input()).toHaveValue('Do major');
    expect(onChange).not.toHaveBeenCalled();
    expect(parentKeyDown).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));

    // Closed: Escape is not handled, so it reaches the parent (the dialog closes).
    await user.keyboard('{Escape}');
    expect(parentKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape', defaultPrevented: false }));
  });

  it('ArrowDown on a closed (focused) input reopens the list at the current value', async () => {
    const { user } = setup();
    await user.click(input());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    expect(listbox()).toBeInTheDocument();
    expect(activeOption()).toHaveTextContent('Do major');
  });

  it('clicking the focused, closed input reopens the list', async () => {
    const { user } = setup();
    await user.click(input());
    await user.keyboard('{Escape}');
    await user.click(input());
    expect(listbox()).toBeInTheDocument();
  });

  it('blur closes the list and reverts the text without a change', async () => {
    const { user, onChange } = setup();
    await user.click(input());
    await user.keyboard('sol');
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input()).toHaveValue('Do major');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the open listbox out of the Tab order (Chromium makes scrollable containers focusable)', async () => {
    const { user } = setup();
    await user.click(input());
    expect(listbox()).toHaveAttribute('tabindex', '-1');
  });

  it('pressing the listbox outside any option (padding, scrollbar) keeps focus on the input and the list open', async () => {
    const { user, onChange } = setup();
    await user.click(input());
    await user.pointer({ keys: '[MouseLeft>]', target: listbox() });
    expect(input()).toHaveFocus();
    expect(listbox()).toBeInTheDocument();
    await user.pointer({ keys: '[/MouseLeft]', target: listbox() });
    expect(input()).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reopening after typing shows the full list again', async () => {
    const { user } = setup();
    await user.click(input());
    await user.keyboard('xyz');
    await user.tab();
    await user.click(input());
    expect(optionNames()).toHaveLength(146);
  });
});
