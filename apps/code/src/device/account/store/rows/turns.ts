import { Deferred, Effect, Fiber, type Scope } from 'effect';

/*
 * One store's rows in turn, by key: what is asked of a row runs after all
 * asked of it before, in the store's own Scope, so it is finished even once
 * its caller goes. A drop waits for what is under way of every row it
 * takes, so a row just made goes too, and what was asked of those rows
 * before the drop, and has not run, is not made. A row is held only while
 * something of it is under way, and a drop only until it is done; only
 * the stamp of a row written with one (`at`) stays, a number a row, since
 * a write read before it may still come.
 */

/** What is asked of one row in its turn. */
export interface Turn<A, W> {
  readonly key: string;
  /** Whose the row is, as a drop judges it. */
  readonly whose: W;
  /** What it does. */
  readonly does: Effect.Effect<A>;
  /** What it gives when it is not made: a drop asked after it took the row. */
  readonly skipped: A;
  /** When what it writes was read: one read before another already made of the row is not made either. */
  readonly at?: bigint;
}

interface Row<W> {
  readonly whose: W;
  /** Done once the last thing asked of the row is. */
  done: Deferred.Deferred<void>;
  /** How many things asked of it are under way. */
  under: number;
}

interface Drop<W> {
  readonly went: (whose: W) => boolean;
  readonly asked: number;
}

/** The turns of one store's rows, run in `scope`. */
export const turns = <W>(scope: Scope.Scope) => {
  // Each ask and each drop takes the next number, in the order asked.
  let asked = 0;
  const rows = new Map<string, Row<W>>();
  const drops = new Set<Drop<W>>();
  // When what the latest stamped write of each row made was read.
  const stamps = new Map<string, bigint>();

  /** Runs `does` after all of its row asked before it, unless a drop asked after it takes the row. */
  const run = <A>({ key, whose, does, skipped, at }: Turn<A, W>) =>
    Effect.suspend(() => {
      const mine = asked++;
      const before = rows.get(key);
      const done = Deferred.makeUnsafe<void>();
      const row = before ?? { whose, done, under: 0 };
      const waits = before?.done;
      row.done = done;
      row.under++;
      rows.set(key, row);
      const turn = Effect.suspend(() => {
        const taken = [...drops].some(
          (drop) => drop.asked > mine && drop.went(whose),
        );
        const last = stamps.get(key);
        if (taken || (at !== undefined && last !== undefined && at < last))
          return Effect.succeed(skipped);
        if (at !== undefined) stamps.set(key, at);
        return does;
      });
      const ends = Effect.sync(() => {
        Deferred.doneUnsafe(done, Effect.void);
        if (--row.under === 0 && rows.get(key) === row) rows.delete(key);
      });
      // Forked as the row is held, so the row is never held by a turn that
      // never runs.
      return Effect.uninterruptible(
        Effect.forkIn(
          Effect.interruptible(
            waits === undefined
              ? turn
              : Effect.andThen(Deferred.await(waits), turn),
          ).pipe(Effect.ensuring(ends)),
          scope,
        ),
      ).pipe(Effect.flatMap(Fiber.join));
    });

  /**
   * Runs `does`, the drop itself, once what is under way of every row that
   * `went` has run; what was asked of those rows before is not made.
   */
  const drop = (went: (whose: W) => boolean, does: Effect.Effect<void>) =>
    Effect.suspend(() => {
      const made: Drop<W> = { went, asked: asked++ };
      drops.add(made);
      const under = [...rows.values()]
        .filter(({ whose }) => went(whose))
        .map(({ done }) => Deferred.await(done));
      return Effect.all(under, { discard: true }).pipe(
        Effect.andThen(does),
        Effect.ensuring(Effect.sync(() => drops.delete(made))),
      );
    });

  /** How many rows have something under way, and how many drops are, for a test. */
  const holding = () => ({ rows: rows.size, drops: drops.size });

  return { run, drop, holding };
};
