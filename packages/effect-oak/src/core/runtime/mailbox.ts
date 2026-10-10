import type { Tagged } from '../actor/index.ts';
import type { Envelope } from '../snapshot/index.ts';

/*
 * The one mailbox. A Message is handled before `send` returns, unless another
 * is being handled (a Lifetime sending as it starts, say): then it waits its
 * turn, so every Message sees a settled app. Its Time is when it was sent, so
 * Times only grow along the queue. Subscribers are told once the queue is
 * empty: many Messages make one render, still inside the keypress that sent
 * the first. A Message sent while the mailbox is closed (the Runtime is
 * stopped) is dropped unrecorded.
 */
export const makeMailbox = (
  now: () => number,
  open: () => boolean,
  deliver: (envelope: Envelope) => void,
  drained: () => void,
) => {
  const waiting: Array<Envelope> = [];
  let busy = false;

  const drain = () => {
    if (busy) return;
    busy = true;
    try {
      for (let next = waiting.shift(); next; next = waiting.shift())
        deliver(next);
    } finally {
      busy = false;
    }
    drained();
  };

  return {
    send: (instance: string, message: Tagged) => {
      if (!open()) return;
      waiting.push({ instance, message, at: now() });
      drain();
    },
    /** Run `f` without handling Messages, then handle what it sent. */
    hold: <A>(f: () => A): A => {
      const draining = busy;
      busy = true;
      try {
        return f();
      } finally {
        busy = draining;
        if (!draining) drain();
      }
    },
  };
};
