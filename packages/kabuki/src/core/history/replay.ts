import { Effect } from 'effect';
import type { ActorDefinition } from '../actor/index.ts';
import { actorAt, actorFor, next } from '../snapshot/index.ts';
import type { Entry, Snapshot } from '../snapshot/index.ts';

/*
 * Replay: the Snapshot right after any entry, from the History's start and
 * the Messages alone. Only Update runs; no Capabilities, Workers or
 * Commands. A Message for an Instance that is gone is dropped, as it was
 * live. One that no longer fits the code has diverged: it is warned of once
 * and skipped.
 *
 * 1. Remember  the Snapshot after an entry, by the entry itself: an entry
 *              never changes, so neither does what follows it. Snapshots
 *              next to each other share every Instance the entry between
 *              them did not change, so remembering each costs little, and
 *              asking for the same one twice gives the same objects.
 * 2. Replay    from the nearest entry remembered on the way back, playing
 *              forward and remembering each.
 * 3. Strict    play every entry of a saved History, throwing at the first
 *              that no longer fits the code.
 */

/** An entry as a History keeps it: numbered, and pointing at the one before it. */
export interface HistoryEntry extends Entry {
  /** Larger than every id before it; never reused while the History lives. */
  readonly id: number;
  /** The entry before it, or `null` right after the start. */
  readonly parent: number | null;
}

/** Millis of playing between yields to the page. */
const BUDGET = 8;

interface Kept {
  readonly start: Snapshot;
  readonly snapshot: Snapshot;
}

const kept = new WeakMap<ActorDefinition, WeakMap<HistoryEntry, Kept>>();

// 1. Remember
export const remember = (
  root: ActorDefinition,
  start: Snapshot,
  entry: HistoryEntry,
  snapshot: Snapshot,
): void => {
  let byEntry = kept.get(root);
  if (!byEntry) kept.set(root, (byEntry = new WeakMap()));
  byEntry.set(entry, { start, snapshot });
};

export const recall = (
  root: ActorDefinition,
  start: Snapshot,
  entry: HistoryEntry,
): Snapshot | undefined => {
  const found = kept.get(root)?.get(entry);
  return found && found.start === start ? found.snapshot : undefined;
};

// 2. Replay
/** The entries still to play on the way to `to`, and the Snapshot to play them from. */
const nearest = (
  root: ActorDefinition,
  start: Snapshot,
  to: HistoryEntry | null,
  entryOf: (id: number) => HistoryEntry,
) => {
  const left: Array<HistoryEntry> = [];
  for (
    let at = to;
    at !== null;
    at = at.parent === null ? null : entryOf(at.parent)
  ) {
    const found = recall(root, start, at);
    if (found) return { from: found, left: left.reverse() };
    left.push(at);
  }
  return { from: start, left: left.reverse() };
};

/** The Snapshot right after `to` (`null`: the start), played now. */
export const replayTo = (
  root: ActorDefinition,
  start: Snapshot,
  to: HistoryEntry | null,
  entryOf: (id: number) => HistoryEntry,
): Snapshot => {
  const { from, left } = nearest(root, start, to, entryOf);
  return left.reduce((before, entry) => {
    const after = played(root, before, entry);
    remember(root, start, entry, after);
    return after;
  }, from);
};

/** The same, yielding to the page as it plays, so a long line never freezes it. */
export const replayingTo = (
  root: ActorDefinition,
  start: Snapshot,
  to: HistoryEntry | null,
  entryOf: (id: number) => HistoryEntry,
): Effect.Effect<Snapshot> =>
  Effect.gen(function* () {
    const { from, left } = nearest(root, start, to, entryOf);
    let snapshot = from;
    let since = performance.now();
    for (const entry of left) {
      snapshot = played(root, snapshot, entry);
      remember(root, start, entry, snapshot);
      if (performance.now() - since >= BUDGET) {
        yield* Effect.yieldNow;
        since = performance.now();
      }
    }
    return snapshot;
  });

/** The Snapshot right after one entry, from the one before it: one that no longer fits the code is skipped. */
const played = (
  root: ActorDefinition,
  snapshot: Snapshot,
  entry: HistoryEntry,
): Snapshot => {
  try {
    return next(root, snapshot, entry).snapshot;
  } catch (error) {
    diverged(entry, error);
    return { root: snapshot.root, at: entry.at };
  }
};

// 3. Strict
/**
 * Play every entry of a saved History, on every Branch, each from the one
 * before it, throwing at the first that no longer fits the code, where
 * Replay would warn and skip it: a Message for a slot the code no longer
 * has, one that no longer decodes or that its Actor's Schema refuses. A
 * Message for an Instance that is gone, in a slot that still exists, was
 * dropped live, and is dropped again. `decode` gives an entry as it is in
 * memory, or the same entry when it no longer decodes.
 */
export const strict = (
  root: ActorDefinition,
  start: Snapshot,
  saved: ReadonlyArray<HistoryEntry>,
  decode: (entry: HistoryEntry) => HistoryEntry,
): void => {
  // How many entries still grow from each one, so a Snapshot is let go
  // once its last one is played.
  const left = new Map<number | null, number>();
  for (const { parent } of saved) left.set(parent, (left.get(parent) ?? 0) + 1);
  const after = new Map<number | null, Snapshot>([[null, start]]);
  // Oldest first, so the entry before each one is already played.
  for (const entry of saved) {
    const before = after.get(entry.parent)!;
    const remaining = left.get(entry.parent)! - 1;
    left.set(entry.parent, remaining);
    if (remaining === 0) after.delete(entry.parent);

    if (!actorFor(root, entry.to))
      throw mismatch(entry, 'the code no longer has a slot on its way');
    const decoded = decode(entry);
    // An entry that does not decode comes back as it was saved.
    if (decoded === entry && actorAt(root, before.root, entry.to))
      throw mismatch(entry, "it no longer decodes with its Actor's Schemas");
    let result: ReturnType<typeof next>;
    try {
      result = next(root, before, decoded);
    } catch (error) {
      throw mismatch(entry, (error as Error).message);
    }
    if (left.has(entry.id)) after.set(entry.id, result.snapshot);
  }
};

const mismatch = (entry: HistoryEntry, reason: string) =>
  new Error(
    `[@kestack/kabuki] the saved History no longer fits the code at entry ${entry.id}, ${entry.message._tag} for ${entry.to}: ${reason}`,
  );

const warned = new WeakSet<HistoryEntry>();

const diverged = (entry: HistoryEntry, error: unknown) => {
  if (warned.has(entry)) return;
  warned.add(entry);
  console.warn(
    `[@kestack/kabuki] Replay diverged at entry ${entry.id}, ${entry.message._tag} for ${entry.to}, and skips it: ${(error as Error).message}`,
  );
};
