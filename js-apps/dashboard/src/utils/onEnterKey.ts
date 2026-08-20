import type { KeyboardEvent } from 'react';

// Enter handler for stepped modals/drawers, where the footer's primary is Next
// rather than a submit — a plain form instead renders `SubmitOnEnter`. Limited
// to single-line inputs, matching native implicit submission, so textareas and
// rich editors keep Enter. Components that consume the key themselves (an open
// Select, a DatePicker panel) mark the event handled.
//
// Attach it conditionally — `cond ? onEnterKey(fn) : undefined` — never branch
// inside the handler: it preventDefaults every Enter it sees, which would
// swallow the implicit submission a `SubmitOnEnter` on the final step needs.
export const onEnterKey =
  (handler: () => void) =>
  (event: KeyboardEvent<HTMLElement>): void => {
    if (
      event.key !== 'Enter' ||
      event.defaultPrevented ||
      !(event.target instanceof HTMLInputElement)
    ) {
      return;
    }

    event.preventDefault();
    handler();
  };
