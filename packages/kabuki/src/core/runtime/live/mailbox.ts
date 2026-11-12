import type { Tagged } from '../../actor/index.ts';
import type { Address, From } from '../../data/index.ts';

/*
 * The one Mailbox. A Message is stamped with its Time and played before
 * `send` returns, unless another is being played (a Worker sending as it
 * starts, say): then it waits its turn, so every Message sees a settled app
 * and Times only grow along the queue. Subscribers are told once the queue
 * is empty: many Messages make one render. A Message sent once the Mailbox
 * is closed is refused. One that does not match its Schemas, or whose
 * Update gives data that does not, changes nothing; the rest of the queue
 * is still played, then the `send` that drained it throws.
 */

/**
 * What became of a Message Sent from outside: `handled` by a rule, `ignored`
 * with none for it in its State, `queued` behind one being played, or
 * `refused`, with the Runtime let go, its Instance gone, or the Message not
 * matching its Schema.
 */
export type Sent = 'handled' | 'ignored' | 'queued' | 'refused';

/** A Message waiting its turn, stamped with its Time. */
export interface Letter {
  readonly to: Address;
  readonly message: Tagged;
  readonly from: From;
  readonly at: number;
}

interface Waiting {
  readonly letter: Letter;
  sent?: Sent;
}

export const makeMailbox = (
  now: () => number,
  deliver: (letter: Letter) => 'handled' | 'ignored' | 'dropped',
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
          const outcome = deliver(next.letter);
          next.sent = outcome === 'dropped' ? 'refused' : outcome;
        } catch (error) {
          next.sent = 'refused';
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
      const sent: Waiting = { letter: { to, message, from, at: now() } };
      waiting.push(sent);
      drain();
      return sent.sent ?? 'queued';
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
