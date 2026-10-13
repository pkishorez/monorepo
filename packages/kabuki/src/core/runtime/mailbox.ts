import type { Tagged } from '../actor/index.ts';
import type { Envelope, Source } from '../snapshot/index.ts';

/*
 * The one Mailbox. A Message is stamped with its Time and handled before
 * `send` returns, unless another is being handled (a Worker sending as it
 * starts, say): then it waits its turn, so every Message sees a settled app
 * and Times only grow along the queue. Subscribers are told once the queue
 * is empty: many Messages make one render. A Message sent while the Mailbox
 * is closed is dropped. One whose Update gives data that does not match its
 * Schemas changes nothing; the rest of the queue is still handled, then the
 * `send` that drained it throws.
 */
export const makeMailbox = (
  now: () => number,
  deliver: (envelope: Envelope) => void,
  drained: () => void,
) => {
  const waiting: Array<Envelope> = [];
  let open = false;
  let busy = false;

  const drain = () => {
    if (busy) return;
    busy = true;
    let failed: { readonly error: unknown } | undefined;
    try {
      for (let next = waiting.shift(); next; next = waiting.shift())
        try {
          deliver(next);
        } catch (error) {
          failed ??= { error };
        }
    } finally {
      busy = false;
    }
    drained();
    if (failed) throw failed.error;
  };

  return {
    open: () => {
      open = true;
    },
    close: () => {
      open = false;
      waiting.length = 0;
    },
    send: (destination: string, message: Tagged, source: Source) => {
      if (!open) return;
      waiting.push({ destination, message, source, at: now() });
      drain();
    },
    /** Run `f` without handling Messages, then handle what it sent. */
    hold: (f: () => void) => {
      const draining = busy;
      busy = true;
      try {
        f();
      } finally {
        busy = draining;
        if (!draining) drain();
      }
    },
  };
};
