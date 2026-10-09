export interface SettingsButtonProps {
  onClick(): void;
  disabled?: boolean;
}

/** U+2699 GEAR + U+FE0E (text presentation, so it follows the text color instead of an emoji). */
const GEAR_ICON = '⚙︎';

/** Gear button (top-right on Home and Training) that opens the Settings dialog. */
export function SettingsButton({ onClick, disabled }: SettingsButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className="settings-button"
      aria-label="Settings"
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={onClick}
    >
      <span aria-hidden="true">{GEAR_ICON}</span>
    </button>
  );
}
