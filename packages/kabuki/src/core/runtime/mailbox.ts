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
/**
 * What became of a Message Sent from outside: `handled` by a rule, `ignored`
 * with none for it in its State, `queued` behind one being handled, or
 * `refused`, with the app stopped, its Instance gone, or the Message not
 * matching its Schema.
 */
export type Sent = 'handled' | 'ignored' | 'queued' | 'refused';

interface Waiting {
  readonly envelope: Envelope;
  sent?: Sent;
}

export const makeMailbox = (
  now: () => number,
  deliver: (envelope: Envelope) => 'handled' | 'ignored' | 'dropped',
  drained: () => void,
) => {
  const waiting: Array<Waiting> = [];
  let open = false;
  let busy = false;

  const drain = () => {
    if (busy) return;
    busy = true;
    let failed: { readonly error: unknown } | undefined;
    try {
      for (let next = waiting.shift(); next; next = waiting.shift())
        try {
          const outcome = deliver(next.envelope);
          next.sent = outcome === 'dropped' ? 'refused' : outcome;
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
    send: (destination: string, message: Tagged, source: Source): Sent => {
      if (!open) return 'refused';
      const sent: Waiting = {
        envelope: { destination, message, source, at: now() },
      };
      waiting.push(sent);
      drain();
      return sent.sent ?? 'queued';
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
