import { describe, expect, it } from 'vitest';
import { micErrorMessage } from './micErrorMessage';

describe('micErrorMessage', () => {
  it.each([
    [
      'permission-denied',
      "Microphone access is blocked. Allow the microphone for this site (usually via the icon in the address bar or your browser's site settings), then press Start training again.",
    ],
    [
      'unsupported',
      "This browser can't access the microphone. Use an up-to-date Chrome, Firefox, Safari or Edge over HTTPS.",
    ],
    [
      'unknown',
      "Couldn't start the microphone. Check that one is connected and not used by another app, then try again.",
    ],
  ] as const)('%s', (kind, message) => {
    expect(micErrorMessage(kind)).toBe(message);
  });
});
