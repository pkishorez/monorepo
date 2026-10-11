import { Effect } from 'effect';
import type { Definition } from '../actor/index.ts';
import { handle, init, restore } from '../snapshot/index.ts';
import type { Snapshot } from '../snapshot/index.ts';
import type { Entry, RuntimeState } from '../log/index.ts';

/*
 * Replay: the Snapshot right after any Log entry, from the Messages alone.
 * Only init and Update run; no Capabilities, Workers or Commands.
 *
 * 1. Start  from the nearest saved Snapshot on the Branch, or from init.
 * 2. Play   each entry after it through `handle`. Entries that were ignored
 *           or dropped live changed nothing, and are skipped.
 * 3. Save   a Snapshot every `every` entries, and the last one, so seeking
 *           again rarely plays far.
 * 4. Yield  to the main thread whenever playing has taken `budget` millis,
 *           so a long Branch never freezes the page. Interrupting a seek
 *           stops it at the next yield.
 *
 * `fold` plays a whole Branch in one go, with no yielding, for code that
 * needs the Snapshot now. `restored` makes the lightest Log an app can be
 * saved as: one Restore of a Snapshot, right after init.
 */

export interface ReplayOptions {
  /** Millis of playing between yields to the main thread. Default 8. */
  readonly budget?: number;
  /** Save a Snapshot every this many entries. Default 100. */
  readonly every?: number;
}

/** Snapshots of one app at any Log entry, rebuilt and remembered. */
export interface Replay {
  /** The Snapshot right after the last entry of `branch`, the entries from the first to it. */
  readonly seek: (branch: ReadonlyArray<Entry>) => Effect.Effect<Snapshot>;
  /** Remember the Snapshot right after an entry, or right after init for `null`. */
  readonly save: (entry: number | null, snapshot: Snapshot) => void;
}

const make = (
  root: Definition,
  input: unknown,
  { budget = 8, every = 100 }: ReplayOptions = {},
): Replay => {
  const saved = new Map<number | null, Snapshot>();
  const initial = () => {
    let snapshot = saved.get(null);
    if (!snapshot) saved.set(null, (snapshot = init(root, input)));
    return snapshot;
  };

  const seek = (branch: ReadonlyArray<Entry>) =>
    Effect.gen(function* () {
      // 1. Start
      let from = branch.length - 1;
      while (from >= 0 && !saved.has(branch[from]!.id)) from--;
      let snapshot = from < 0 ? initial() : saved.get(branch[from]!.id)!;

      let since = now();
      for (let index = from + 1; index < branch.length; index++) {
        // 2. Play
        const entry = branch[index]!;
        snapshot = play(root, snapshot, entry);
        // 3. Save
        if ((index + 1) % every === 0) saved.set(entry.id, snapshot);
        // 4. Yield
        if (now() - since >= budget) {
          yield* Effect.yieldNow;
          since = now();
        }
      }
      const last = branch.at(-1);
      if (last) saved.set(last.id, snapshot);
      return snapshot;
    });

  return {
    seek,
    save: (entry, snapshot) => {
      saved.set(entry, snapshot);
    },
  };
};

/** The Snapshot right after one entry, from the one before it. */
const play = (root: Definition, snapshot: Snapshot, entry: Entry): Snapshot => {
  if (entry.outcome !== 'handled') return snapshot;
  const played = handle(root, snapshot, entry);
  if (played.outcome !== 'handled') diverged(entry, played.outcome);
  return played.snapshot;
};

/** The Snapshot right after the last entry of `branch`, played now with no yielding, from init or from `from`. */
const fold = (
  root: Definition,
  branch: ReadonlyArray<Entry>,
  from: Snapshot = init(root),
): Snapshot =>
  branch.reduce((snapshot, entry) => play(root, snapshot, entry), from);

/**
 * A saved Log of one Restore: the app right after init, then `snapshot` at
 * Time `at`. The lightest way to save an app: nothing before the Restore can
 * be travelled to but init.
 */
const restored = (
  root: Definition,
  snapshot: Snapshot,
  at: number,
  input?: unknown,
): RuntimeState => ({
  entries: [
    {
      id: 0,
      parent: null,
      instance: root.name,
      message: restore(snapshot),
      source: { kind: 'restore', instance: root.name },
      at,
      outcome: 'handled',
      from: init(root, input).state._tag,
      to: snapshot.state._tag,
    },
  ],
  head: 0,
  running: true,
  shown: null,
});

export const Replay = { make, fold, restored };

const now = () => performance.now();

/** The Messages no longer give what they gave live: the code changed under the Log. */
const diverged = (entry: Entry, outcome: string) =>
  console.warn(
    `[effect-oak] Replay diverged at entry ${entry.id}: ${entry.message._tag} for ${entry.instance} was handled live, ${outcome} now`,
  );
