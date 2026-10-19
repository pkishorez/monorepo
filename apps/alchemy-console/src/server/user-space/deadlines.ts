import { Effect } from 'effect';

/*
 * Moments the User Space waits for, as streams wait for their caller's
 * session to end, kept on the object's alarm rather than a timer: a timer
 * keeps a Durable Object awake, an alarm lets it hibernate and wakes it.
 * Waits live in memory; a stream that was waiting is replayed on wake, and
 * waits again.
 */

interface AlarmStorage {
  readonly getAlarm: () => Promise<number | null>;
  readonly setAlarm: (at: number) => Promise<void>;
}

interface Waiting {
  readonly until: number;
  readonly done: () => void;
}

export const makeDeadlines = (storage: AlarmStorage) => {
  const waiting = new Set<Waiting>();

  /** Sets the alarm for the earliest deadline, unless it rings sooner
   * already; once it has rung, whatever was set is spent. */
  const schedule = async (rang: boolean) => {
    let next = Infinity;
    for (const each of waiting) next = Math.min(next, each.until);
    if (next === Infinity) return;
    const set = rang ? null : await storage.getAlarm();
    if (set === null || set > next) await storage.setAlarm(next);
  };

  return {
    /** Done when the moment `until`, in milliseconds since the epoch, has passed. */
    at: (until: number) =>
      Effect.callback<void>((resume) => {
        const entry: Waiting = { until, done: () => resume(Effect.void) };
        waiting.add(entry);
        void schedule(false);
        return Effect.sync(() => void waiting.delete(entry));
      }),
    /** The alarm rang at `now`: ends every wait that is due, and sets the next. */
    ring: async (now: number) => {
      for (const each of waiting)
        if (each.until <= now) {
          waiting.delete(each);
          each.done();
        }
      await schedule(true);
    },
    /** How many waits are pending. */
    pending: () => waiting.size,
  };
};

export type Deadlines = ReturnType<typeof makeDeadlines>;
