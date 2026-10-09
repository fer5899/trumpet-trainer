import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without `globals`, so RTL cannot register its automatic cleanup.
afterEach(() => {
  cleanup();
});

// jsdom 25 does not implement HTMLDialogElement.showModal/close (it only reflects `open`).
// Minimal stand-ins: showModal opens; close closes and fires `close` like the browser.
// Esc is simulated through the dialog's onKeyDown (user.keyboard('{Escape}')), not native `cancel`.
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  }
}
