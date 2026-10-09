import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { getScaleOption, SCALE_OPTIONS, searchScaleOptions, type ScaleOptionId } from '../music/scales';

export interface ScaleComboboxProps {
  value: ScaleOptionId;
  onChange(id: ScaleOptionId): void;
}

const NO_ACTIVE = -1;
const NO_MATCHES_TEXT = 'No matching scales';

const indexOfValue = (value: ScaleOptionId): number => SCALE_OPTIONS.findIndex((o) => o.id === value);

/**
 * Searchable scale selector (APG combobox with a listbox popup). The list is rendered in normal flow
 * below the input only while open; `aria-selected` marks the active (highlighted) option.
 */
export function ScaleCombobox({ value, onChange }: ScaleComboboxProps): JSX.Element {
  const inputId = useId();
  const listId = useId();
  /** Typed text; null while nothing was typed since opening (the input then shows the selected name). */
  const [query, setQuery] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(NO_ACTIVE);

  const selectedName = getScaleOption(value)?.name ?? '';
  const results = isOpen ? searchScaleOptions(query ?? '') : [];
  const optionId = (index: number): string => `${listId}-option-${index}`;
  const activeOptionId = isOpen && activeIndex >= 0 && activeIndex < results.length ? optionId(activeIndex) : null;

  useEffect(() => {
    if (activeOptionId === null) return;
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeOptionId]);

  const open = (): void => {
    setQuery(null);
    setActiveIndex(indexOfValue(value));
    setIsOpen(true);
  };

  const closeAndRevert = (): void => {
    setIsOpen(false);
    setQuery(null);
    setActiveIndex(NO_ACTIVE);
  };

  const select = (id: ScaleOptionId): void => {
    closeAndRevert();
    onChange(id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!isOpen) {
          open();
          return;
        }
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        if (results.length > 0) setActiveIndex(Math.min(results.length - 1, Math.max(0, activeIndex + delta)));
        return;
      }
      case 'Enter':
        if (activeOptionId !== null) {
          event.preventDefault();
          select(results[activeIndex].id);
        }
        return;
      case 'Escape':
        if (!isOpen) return; // Not handled: the dialog closes.
        event.preventDefault();
        event.stopPropagation();
        closeAndRevert();
        return;
    }
  };

  return (
    <div className="scale-combobox">
      <label htmlFor={inputId}>Scale</label>
      <input
        id={inputId}
        className="scale-combobox__input"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={activeOptionId ?? undefined}
        autoComplete="off"
        spellCheck={false}
        value={query ?? selectedName}
        onFocus={(event) => {
          open();
          event.currentTarget.select();
        }}
        onClick={() => {
          if (!isOpen) open();
        }}
        onBlur={closeAndRevert}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          const text = event.target.value;
          setQuery(text);
          setIsOpen(true);
          setActiveIndex(0); // activeOptionId is null when there are no results.
        }}
      />
      {isOpen && (
        // tabIndex -1: Chromium makes a scrollable container keyboard-focusable, so Tab from the input
        // would focus the list, whose blur-close then unmounts it and drops focus to <body>. For the same
        // reason a press anywhere on the list (options, padding, scrollbar) must not move focus.
        <ul
          id={listId}
          className="scale-combobox__list"
          role="listbox"
          aria-label="Scales"
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
        >
          {results.length === 0 ? (
            <li className="scale-combobox__option scale-combobox__option--empty" role="option"
              aria-disabled="true"
              aria-selected="false"
            >
              {NO_MATCHES_TEXT}
            </li>
          ) : (
            results.map((option, index) => (
              <li
                key={option.id}
                id={optionId(index)}
                className="scale-combobox__option"
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => select(option.id)}
              >
                {option.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
