import type { Tagged } from '../actor/index.ts';
import type { Address, Entry, From } from '../snapshot/index.ts';

/*
 * The one Mailbox. A Message is stamped with its Time and played before
 * `send` returns, unless another is being played (a Worker sending as it
 * starts, say): then it waits its turn, so every Message sees a settled app
 * and Times only grow along the queue. A task, such as following a Snapshot
 * handed in, waits its turn the same way, so it never lands in the middle
 * of a Message. Subscribers are told once the queue is empty: many Messages
 * make one render. A Message sent once the Mailbox is closed is refused.
 * One that does not match its Schemas, or whose Update gives data that does
 * not, changes nothing; the rest of the queue is still played, then the
 * `send` that drained it throws.
 */

/**
 * What became of a Message Sent from outside: `handled` by a rule, `ignored`
 * with none for it in its State, `queued` behind one being played, or
 * `refused`, with the Runtime stopped or let go, its Instance gone, or the
 * Message not matching its Schema.
 */
export type Sent = 'handled' | 'ignored' | 'queued' | 'refused';

type Waiting =
  | { readonly entry: Entry; sent?: Sent }
  | { readonly task: () => void };

export const makeMailbox = (
  now: () => number,
  deliver: (entry: Entry) => 'handled' | 'ignored' | 'dropped',
  drained: () => void,
) => {
  const waiting: Array<Waiting> = [];
  let open = true;
  let busy = false;

  const drain = () => {
    if (busy) return;
    busy = true;
    let failed: { readonly error: unknown } | undefined;
    try {
      for (let next = waiting.shift(); next; next = waiting.shift())
        try {
          if ('task' in next) next.task();
          else {
            const outcome = deliver(next.entry);
            next.sent = outcome === 'dropped' ? 'refused' : outcome;
          }
        } catch (error) {
          if ('entry' in next) next.sent = 'refused';
          failed ??= { error };
        }
    } finally {
      busy = false;
    }
    drained();
    if (failed) throw failed.error;
  };

  return {
    close: () => {
      open = false;
      waiting.length = 0;
    },
    send: (to: Address, message: Tagged, from: From): Sent => {
      if (!open) return 'refused';
      const sent: Waiting = { entry: { to, message, from, at: now() } };
      waiting.push(sent);
      drain();
      return sent.sent ?? 'queued';
    },
    /** Run a task in its turn: at once, or after the Message being played and the ones waiting. */
    run: (task: () => void) => {
      if (!open) return;
      waiting.push({ task });
      drain();
    },
    /** Run `f` without playing Messages, then play what it sent. */
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
