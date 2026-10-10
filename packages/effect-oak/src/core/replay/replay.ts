import { Effect } from 'effect';
import type { Definition } from '../actor/index.ts';
import { handle, init } from '../snapshot/index.ts';
import type { Snapshot } from '../snapshot/index.ts';
import type { Entry } from '../log/index.ts';

/*
 * Replay: the Snapshot right after any Log entry, from the Messages alone.
 * Only init and Update run; no Capabilities, Lifetimes or Commands.
 *
 * 1. Start  from the nearest saved Snapshot on the Branch, or from init.
 * 2. Play   each entry after it through `handle`. Entries that were ignored
 *           or dropped live changed nothing, and are skipped.
 * 3. Save   a Snapshot every `every` entries, and the last one, so seeking
 *           again rarely plays far.
 * 4. Yield  to the main thread whenever playing has taken `budget` millis,
 *           so a long Branch never freezes the page. Interrupting a seek
 *           stops it at the next yield.
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
        if (entry.outcome === 'handled') {
          const played = handle(root, snapshot, entry);
          if (played.outcome !== 'handled') diverged(entry, played.outcome);
          snapshot = played.snapshot;
        }
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

export const Replay = { make };

const now = () => performance.now();

/** The Messages no longer give what they gave live: the code changed under the Log. */
const diverged = (entry: Entry, outcome: string) =>
  console.warn(
    `[effect-oak] Replay diverged at entry ${entry.id}: ${entry.message._tag} for ${entry.instance} was handled live, ${outcome} now`,
  );
