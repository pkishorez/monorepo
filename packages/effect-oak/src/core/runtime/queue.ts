import type { Tagged } from '../node/index.ts';
import type { Instance } from '../tree/index.ts';

/**
 * Messages are handled one at a time, in the order they were sent. A Message
 * sent while another is being handled (a Lifetime starting on entry, say)
 * waits its turn, so every Update sees a settled tree. Its Time is when it was
 * sent, so Times only ever grow along the queue. A Message sent while the
 * queue is closed (the Runtime is stopped) is dropped unrecorded.
 */
export const makeQueue = (
  now: () => number,
  open: () => boolean,
  handle: (instance: Instance, message: Tagged, at: number) => void,
) => {
  const waiting: Array<readonly [Instance, Tagged, number]> = [];
  let busy = false;

  const drain = () => {
    if (busy) return;
    busy = true;
    try {
      for (let next = waiting.shift(); next; next = waiting.shift()) {
        handle(...next);
      }
    } finally {
      busy = false;
    }
  };

  return {
    send: (instance: Instance, message: Tagged) => {
      if (!open()) return;
      waiting.push([instance, message, now()]);
      drain();
    },
    /** Run `f` without handling Messages, then handle what it sent. */
    hold: <A>(f: () => A): A => {
      busy = true;
      try {
        return f();
      } finally {
        busy = false;
        drain();
      }
    },
  };
};
