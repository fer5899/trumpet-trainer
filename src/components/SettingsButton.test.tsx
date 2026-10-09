import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsButton } from './SettingsButton';

describe('SettingsButton', () => {
  it('is a button named Settings that opens a dialog, with a hidden text-presentation gear', async () => {
    const onClick = vi.fn();
    render(<SettingsButton onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Settings' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveClass('settings-button');
    expect(button).toBeEnabled();
    const icon = button.querySelector('span')!;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon.textContent).toBe('⚙︎');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('can be disabled', async () => {
    const onClick = vi.fn();
    render(<SettingsButton onClick={onClick} disabled />);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
