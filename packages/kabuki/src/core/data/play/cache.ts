import { Effect } from 'effect';
import type { ActorDefinition } from '../../actor/engine/index.ts';
import { play } from './play.ts';
import { isRestore } from './restore.ts';
import { init } from './init.ts';
import type { Entry, Snapshot } from './init.ts';
import { actorAt, actorFor } from './tree.ts';

/*
 * Replay: the Snapshot right after any entry, from the root's Input and the
 * Messages alone. Only init and Update run; no Capabilities, Workers or
 * Commands. A Message for an Instance that is gone is dropped, as it was
 * live. One that no longer fits the code has diverged: it is warned of once
 * and skipped.
 *
 * 1. Remember  the Snapshot after an entry, by the entry itself: an entry
 *              never changes, so neither does what follows it. A Runtime
 *              remembers every one it plays.
 * 2. Replay    from the nearest entry remembered on the way back, playing
 *              forward and remembering one in every hundred, and the last.
 * 3. Strict    play every entry of a saved History, throwing at the first
 *              that no longer fits the code.
 */

/** Remember a Snapshot every this many entries played. */
const EVERY = 100;
/** Millis of playing between yields to the page. */
const BUDGET = 8;

interface Kept {
  readonly input: unknown;
  readonly snapshot: Snapshot;
}

const kept = new WeakMap<ActorDefinition, WeakMap<Entry, Kept>>();
const inits = new WeakMap<ActorDefinition, Kept>();

// 1. Remember
export const remember = (
  root: ActorDefinition,
  input: unknown,
  entry: Entry,
  snapshot: Snapshot,
): void => {
  let byEntry = kept.get(root);
  if (!byEntry) kept.set(root, (byEntry = new WeakMap()));
  byEntry.set(entry, { input, snapshot });
};

const recall = (
  root: ActorDefinition,
  input: unknown,
  entry: Entry,
): Snapshot | undefined => {
  const found = kept.get(root)?.get(entry);
  return found && Object.is(found.input, input) ? found.snapshot : undefined;
};

/** The app right after init with this Input: the same value each time it is asked again. */
export const initial = (root: ActorDefinition, input: unknown): Snapshot => {
  const found = inits.get(root);
  if (found && Object.is(found.input, input)) return found.snapshot;
  const snapshot = init(root, input);
  inits.set(root, { input, snapshot });
  return snapshot;
};

// 2. Replay
/** The entries still to play on the way to `to`, and the Snapshot to play them from. */
const nearest = (
  root: ActorDefinition,
  input: unknown,
  to: Entry | null,
  entryOf: (id: number) => Entry,
) => {
  const left: Array<Entry> = [];
  for (
    let at = to;
    at !== null;
    at = at.parent === null ? null : entryOf(at.parent)
  ) {
    const found = recall(root, input, at);
    if (found) return { from: found, left: left.reverse() };
    left.push(at);
  }
  return { from: initial(root, input), left: left.reverse() };
};

/** The Snapshot right after `to` (`null`: init), played now. */
export const replayTo = (
  root: ActorDefinition,
  input: unknown,
  to: Entry | null,
  entryOf: (id: number) => Entry,
): Snapshot => {
  const { from, left } = nearest(root, input, to, entryOf);
  return left.reduce((before, entry, index) => {
    const after = played(root, before, entry);
    if ((index + 1) % EVERY === 0 || index === left.length - 1)
      remember(root, input, entry, after);
    return after;
  }, from);
};

/** The same, yielding to the page as it plays, so a long line never freezes it. */
export const seekTo = (
  root: ActorDefinition,
  input: unknown,
  to: Entry | null,
  entryOf: (id: number) => Entry,
): Effect.Effect<Snapshot> =>
  Effect.gen(function* () {
    const { from, left } = nearest(root, input, to, entryOf);
    let snapshot = from;
    let since = performance.now();
    for (const [index, entry] of left.entries()) {
      snapshot = played(root, snapshot, entry);
      if ((index + 1) % EVERY === 0 || index === left.length - 1)
        remember(root, input, entry, snapshot);
      if (performance.now() - since >= BUDGET) {
        yield* Effect.yieldNow;
        since = performance.now();
      }
    }
    return snapshot;
  });

/** The Snapshot right after `entry`, remembered or played from the one before it. */
export const after = (
  root: ActorDefinition,
  input: unknown,
  before: Snapshot,
  entry: Entry,
): Snapshot => recall(root, input, entry) ?? played(root, before, entry);

/** The Snapshot right after one entry, from the one before it: one that no longer fits the code is skipped. */
export const played = (
  root: ActorDefinition,
  snapshot: Snapshot,
  entry: Entry,
): Snapshot => {
  try {
    return play(root, snapshot, entry).snapshot;
  } catch (error) {
    diverged(entry, error);
    return { entry: entry.id, root: snapshot.root };
  }
};

// 3. Strict
/**
 * Play every entry of a saved History, on every Branch, each from the one
 * before it, throwing at the first that no longer fits the code, where
 * Replay would warn and skip it: a Message for a slot the code no longer
 * has, one that no longer decodes or that its Actor's Schema refuses, or a
 * Restore that is not put in place. A Message for an Instance that is gone,
 * in a slot that still exists, was dropped live, and is dropped again.
 * `decode` gives an entry as it is in memory, or the same entry when it
 * no longer decodes.
 */
export const strict = (
  root: ActorDefinition,
  saved: ReadonlyArray<Entry>,
  input: unknown,
  decode: (entry: Entry) => Entry,
): void => {
  // How many entries still grow from each one, so a Snapshot is let go
  // once its last one is played.
  const left = new Map<number | null, number>();
  for (const { parent } of saved) left.set(parent, (left.get(parent) ?? 0) + 1);
  const after = new Map<number | null, Snapshot>([[null, init(root, input)]]);
  // Oldest first, so the entry before each one is already played.
  for (const entry of saved) {
    const before = after.get(entry.parent)!;
    const remaining = left.get(entry.parent)! - 1;
    left.set(entry.parent, remaining);
    if (remaining === 0) after.delete(entry.parent);

    const restoring = isRestore(entry.message);
    if (!restoring && !actorFor(root, entry.to))
      throw mismatch(entry, 'the code no longer has a slot on its way');
    const decoded = decode(entry);
    // An entry that does not decode comes back as it was saved.
    if (
      decoded === entry &&
      (restoring || actorAt(root, before.root, entry.to))
    )
      throw mismatch(entry, "it no longer decodes with its Actor's Schemas");
    let next: ReturnType<typeof play>;
    try {
      next = play(root, before, decoded);
    } catch (error) {
      throw mismatch(entry, (error as Error).message);
    }
    if (restoring && next.outcome !== 'handled')
      throw mismatch(entry, 'its Snapshot no longer matches the Actors');
    if (left.has(entry.id)) after.set(entry.id, next.snapshot);
  }
};

const mismatch = (entry: Entry, reason: string) =>
  new Error(
    `[@kestack/kabuki] the saved History no longer fits the code at entry ${entry.id}, ${entry.message._tag} for ${entry.to}: ${reason}`,
  );

const warned = new WeakSet<Entry>();

const diverged = (entry: Entry, error: unknown) => {
  if (warned.has(entry)) return;
  warned.add(entry);
  console.warn(
    `[@kestack/kabuki] Replay diverged at entry ${entry.id}, ${entry.message._tag} for ${entry.to}, and skips it: ${(error as Error).message}`,
  );
};
