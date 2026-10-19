import { Effect } from 'effect';
import type { ActorDefinition } from '../actor/index.ts';
import { actorAt, handle, init, isRestore } from '../snapshot/index.ts';
import type { Envelope, Handled, Snapshot } from '../snapshot/index.ts';
import type { Entry } from './history.ts';

/*
 * Replay: the Snapshot right after any entry, from the Messages alone. Only
 * init and Update run; no Capabilities, Workers or Commands. A Message for an
 * Instance that is gone is dropped, as it was live. One that no longer fits
 * the code has diverged: it is warned of once and skipped.
 */

export interface ReplayOptions {
  /** Millis of playing between yields to the main thread. Default 8. */
  readonly budget?: number;
  /** Remember a Snapshot every this many entries. Default 100. */
  readonly every?: number;
}

/** Snapshots of one app, played from init and remembered, so playing again starts from the nearest one. */
export interface Replay {
  /** The Snapshot right after the last entry of `branch`, played now. */
  readonly at: (branch: ReadonlyArray<Entry>) => Snapshot;
  /** The same, yielding to the page as it plays, so a long Branch never freezes it. */
  readonly seek: (branch: ReadonlyArray<Entry>) => Effect.Effect<Snapshot>;
  /** Remember the Snapshot right after an entry. */
  readonly remember: (entry: number, snapshot: Snapshot) => void;
  /** Forget the Snapshot right after an entry the History no longer has. */
  readonly forget: (entry: number) => void;
}

const make = (
  root: ActorDefinition,
  input: unknown,
  { budget = 8, every = 100 }: ReplayOptions = {},
): Replay => {
  const played = new Map<number | null, Snapshot>([[null, init(root, input)]]);

  /** How many entries of `branch` are already played, and the Snapshot after them. */
  const nearest = (branch: ReadonlyArray<Entry>) => {
    const count = branch.findLastIndex((entry) => played.has(entry.id)) + 1;
    const after = count === 0 ? null : branch[count - 1]!.id;
    return { count, snapshot: played.get(after)! };
  };

  const at: Replay['at'] = (branch) => {
    const { count, snapshot } = nearest(branch);
    return branch.slice(count).reduce((before, entry) => {
      const after = play(root, before, entry);
      played.set(entry.id, after);
      return after;
    }, snapshot);
  };

  const seek: Replay['seek'] = (branch) =>
    Effect.gen(function* () {
      let { count, snapshot } = nearest(branch);
      let since = performance.now();
      for (const entry of branch.slice(count)) {
        snapshot = play(root, snapshot, entry);
        if (++count % every === 0 || count === branch.length)
          played.set(entry.id, snapshot);
        if (performance.now() - since >= budget) {
          yield* Effect.yieldNow;
          since = performance.now();
        }
      }
      return snapshot;
    });

  return {
    at,
    seek,
    remember: (entry, snapshot) => void played.set(entry, snapshot),
    forget: (entry) => void played.delete(entry),
  };
};

/**
 * Handle an Envelope from the History: first check its Message against its
 * Actor's Schema, as a Send does. Throws when either no longer fits, because
 * the code changed under the History.
 */
const replayed = (
  root: ActorDefinition,
  snapshot: Snapshot,
  envelope: Envelope,
): Handled => {
  const { destination, message } = envelope;
  if (!isRestore(message))
    actorAt(root, snapshot, destination)?.check.message(
      message,
      `Message ${JSON.stringify(message._tag)}`,
    );
  return handle(root, snapshot, envelope);
};

/**
 * What came of an Envelope on this Snapshot: worked out by handling it again,
 * never kept. One that no longer fits the code, which Replay skips, counts as
 * ignored.
 */
export const outcomeOf = (
  root: ActorDefinition,
  snapshot: Snapshot,
  envelope: Envelope,
): Handled['outcome'] => {
  try {
    return replayed(root, snapshot, envelope).outcome;
  } catch {
    return 'ignored';
  }
};

/** The Snapshot right after one entry, from the one before it. */
const play = (
  root: ActorDefinition,
  snapshot: Snapshot,
  entry: Entry,
): Snapshot => {
  try {
    return replayed(root, snapshot, entry).snapshot;
  } catch (error) {
    diverged(entry, error);
    return snapshot;
  }
};

/** The Snapshot right after a whole Branch, played now from init with the root's Input. */
const fold = (
  root: ActorDefinition,
  branch: ReadonlyArray<Entry>,
  input?: unknown,
): Snapshot =>
  branch.reduce(
    (snapshot, entry) => play(root, snapshot, entry),
    init(root, input),
  );

/**
 * Play a Branch from init, throwing at the first entry that no longer fits
 * the code, where Replay would warn and skip it: a Message its Actor's Schema
 * refuses, or a Restore that is not put in place.
 */
export const strict = (
  root: ActorDefinition,
  branch: ReadonlyArray<Entry>,
  input?: unknown,
): Snapshot =>
  branch.reduce(
    (snapshot, entry) => {
      let handled: Handled;
      try {
        handled = replayed(root, snapshot, entry);
      } catch (error) {
        throw mismatch(entry, (error as Error).message);
      }
      if (isRestore(entry.message) && handled.outcome !== 'handled')
        throw mismatch(entry, 'its Snapshot no longer matches the Actors');
      return handled.snapshot;
    },
    init(root, input),
  );

const mismatch = (entry: Entry, reason: string) =>
  new Error(
    `[@kestack/kabuki] the saved History no longer fits the code at entry ${entry.id}, ${entry.message._tag} for ${entry.destination}: ${reason}`,
  );

export const Replay = { make, fold };

const warned = new WeakSet<Entry>();

const diverged = (entry: Entry, error: unknown) => {
  if (warned.has(entry)) return;
  warned.add(entry);
  console.warn(
    `[@kestack/kabuki] Replay diverged at entry ${entry.id}, ${entry.message._tag} for ${entry.destination}, and skips it: ${(error as Error).message}`,
  );
};
