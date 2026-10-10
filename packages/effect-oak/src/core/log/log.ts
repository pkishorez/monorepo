import type { Tagged } from '../node/index.ts';
import { makeStore } from './store.ts';

/*
 * The Log: a tree of entries, one per Message, each pointing to its parent.
 * One value in memory, the only source of truth for the Runtime, Replay and
 * timelines.
 *
 * 1. Append    pushes an entry after the Head and moves the Head to it. The
 *              entries are one append-only array every state shares.
 * 2. Set       moves the Head, or says whether the Runtime runs and which
 *              entry is shown. Every change is a new state.
 * 3. Read      the Branch to any entry, back through `parent`, worked out at
 *              most once per change; and the children of any entry.
 */

/** One line of the Log: which Instance got which Message, when, and what came of it. */
export interface Entry {
  /** Its position in the Log. */
  readonly id: number;
  /** The entry before it, or `null` right after init. */
  readonly parent: number | null;
  readonly message: Tagged;
  /** When it was sent, in milliseconds of the app's Time. */
  readonly at: number;
  /** The number of the Instance it went to, in the order its tree created it. */
  readonly instance: number;
  readonly path: string;
  readonly outcome: 'handled' | 'ignored' | 'dropped';
  /** The State tag before and after. */
  readonly from: string;
  readonly to: string;
}

/** Everything the Runtime knows about its Log, as one value. */
export interface RuntimeState {
  /** Append-only: an entry's id is its position. */
  readonly entries: ReadonlyArray<Entry>;
  /** The entry the next Message goes after, or `null` right after init. */
  readonly head: number | null;
  readonly running: boolean;
  /** The entry shown, or `null` for live. */
  readonly shown: number | null;
}

/** The Log, held in a store. */
export interface Log {
  readonly get: () => RuntimeState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Push an entry after the Head, and move the Head to it. */
  readonly append: (entry: Omit<Entry, 'id' | 'parent'>) => Entry;
  /** Move the Head, start or stop, or show an entry, in one change. */
  readonly set: (
    change: Partial<Pick<RuntimeState, 'head' | 'running' | 'shown'>>,
  ) => void;
  /** The entries from the first to `to`, following `parent`; empty for `null`. */
  readonly branch: (to: number | null) => ReadonlyArray<Entry>;
  /** The entries that follow an entry, oldest first; `null` for right after init. */
  readonly children: (of: number | null) => ReadonlyArray<Entry>;
}

const EMPTY: RuntimeState = {
  entries: [],
  head: null,
  running: false,
  shown: null,
};

/** A Log, empty or carrying on from a state saved before. */
const make = (saved: RuntimeState = EMPTY): Log => {
  const entries: Array<Entry> = [...saved.entries];
  const store = makeStore<RuntimeState>({ ...saved, entries });
  const children = new Map<number | null, Array<Entry>>();
  const index = (entry: Entry) => {
    const siblings = children.get(entry.parent);
    if (siblings) siblings.push(entry);
    else children.set(entry.parent, [entry]);
  };
  entries.forEach(index);

  let branches = new Map<number | null, ReadonlyArray<Entry>>();
  const change = (next: RuntimeState) => {
    branches = new Map();
    store.set(next);
  };

  // 1. Append
  const append: Log['append'] = (fields) => {
    const { head } = store.get();
    const entry: Entry = { id: entries.length, parent: head, ...fields };
    entries.push(entry);
    index(entry);
    change({ ...store.get(), head: entry.id });
    return entry;
  };

  // 2. Set
  const set: Log['set'] = (fields) => change({ ...store.get(), ...fields });

  // 3. Read
  const branch: Log['branch'] = (to) => {
    let path = branches.get(to);
    if (!path) {
      const back: Array<Entry> = [];
      for (let id = to; id !== null; id = entries[id]!.parent) {
        back.push(entries[id]!);
      }
      path = back.reverse();
      branches.set(to, path);
    }
    return path;
  };

  return {
    get: store.get,
    subscribe: store.subscribe,
    append,
    set,
    branch,
    children: (of) => children.get(of) ?? [],
  };
};

export const Log = { make };
