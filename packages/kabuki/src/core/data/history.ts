import type { AnyActor, Tagged } from '../actor/index.ts';
import {
  checkSaved,
  decodeEntry,
  encodeEntry,
  isRestore,
  remember,
  replayTo,
  restore,
  strict,
} from './play/index.ts';
import type {
  Address,
  Entry,
  From,
  SavedHistory,
  Snapshot,
} from './play/index.ts';

/*
 * History: everything that happened to an app, as a tree of entries, one per
 * Message, each pointing to the entry before it, and the Head the next one
 * grows from. A plain, immutable value: every function gives a new one and
 * leaves the one it was given as it was.
 *
 * 1. Add      an entry after the Head, which moves to it. After an entry
 *             that already has one after it, it grows a new Branch.
 * 2. Go       move the Head to any entry, or to init.
 * 3. Read     the line from the first entry to any one, the entries that
 *             follow one, and the last entry of every Branch.
 * 4. Compact  to a Window: the oldest entry kept becomes a Restore of the
 *             Snapshot right after it, and what does not grow from it is
 *             swept. Doing it twice is doing it once.
 * 5. Save     as plain JSON, every value as its Schema's encoded side
 *             (./play/saved.ts), and load it again with the code as it is now.
 *
 * Growing is cheap: a History shares its entries with the one it grew
 * from, and its `entries` list is made only when read.
 */

export type { Entry, From, SavedHistory } from './play/index.ts';

export interface History {
  /** The root's Input, which init starts from. Not saved: a History loaded is given it again. */
  readonly input: unknown;
  /** Every entry, on every Branch, oldest first. */
  readonly entries: ReadonlyArray<Entry>;
  /** The entry the next Message goes after, or `null` right after init. */
  readonly head: number | null;
}

/** The entries one or more Histories hold, only ever added to. */
interface Store {
  readonly list: Array<Entry>;
  /** Where each entry is in the list, by id. */
  readonly at: Map<number, number>;
  /** Where the entries that follow each one are in the list, oldest first. */
  readonly after: Map<number | null, Array<number>>;
}

/** What a History value reads from: the first `count` entries of its Store, and the next id to give. */
interface Held {
  readonly store: Store;
  readonly count: number;
  readonly next: number;
}

const held = new WeakMap<History, Held>();

const storeOf = (entries: ReadonlyArray<Entry>): Store => {
  const store: Store = { list: [], at: new Map(), after: new Map() };
  for (const entry of entries) push(store, entry);
  return store;
};

const push = (store: Store, entry: Entry) => {
  store.at.set(entry.id, store.list.length);
  const siblings = store.after.get(entry.parent) ?? [];
  store.after.set(entry.parent, siblings);
  siblings.push(store.list.length);
  store.list.push(entry);
};

const value = (
  input: unknown,
  head: number | null,
  store: Store,
  count: number,
  next: number,
): History => {
  let entries: ReadonlyArray<Entry> | undefined;
  const history: History = Object.freeze({
    input,
    head,
    get entries() {
      return (entries ??= Object.freeze(store.list.slice(0, count)));
    },
  });
  held.set(history, { store, count, next });
  return history;
};

/** What a History reads from; one written by hand is read once from its `entries`. */
const heldOf = (history: History): Held => {
  const known = held.get(history);
  if (known) return known;
  const made = {
    store: storeOf(history.entries),
    count: history.entries.length,
    next: (history.entries.at(-1)?.id ?? -1) + 1,
  };
  held.set(history, made);
  return made;
};

const find = (history: History, id: number): Entry | undefined => {
  const { store, count } = heldOf(history);
  const index = store.at.get(id);
  return index !== undefined && index < count ? store.list[index] : undefined;
};

/** The entry with this id; throws if the History has none. */
const entryOf = (history: History, id: number): Entry => {
  const entry = find(history, id);
  if (!entry) throw new RangeError(`[@kestack/kabuki] no History entry ${id}`);
  return entry;
};

/** An empty History: right after init with the root's Input. */
const make = (options?: { readonly input?: unknown }): History =>
  value(options?.input, null, storeOf([]), 0, 0);

// 1. Add
/** Write an entry after the Head, and move the Head to it. */
const add = (
  history: History,
  written: {
    readonly to: Address<any>;
    readonly message: Tagged;
    readonly from: From;
    readonly at: number;
  },
): { readonly history: History; readonly entry: Entry } => {
  const { store, count, next } = heldOf(history);
  const entry: Entry = Object.freeze({
    id: next,
    parent: history.head,
    to: written.to,
    message: written.message,
    from: written.from,
    at: written.at,
  });
  // The newest History on its Store adds in place; an older one copies first.
  const own =
    count === store.list.length ? store : storeOf(store.list.slice(0, count));
  push(own, entry);
  return {
    history: value(history.input, entry.id, own, count + 1, next + 1),
    entry,
  };
};

// 2. Go
/** The same History with its Head at an entry (`null`: init), so the next one grows from there. */
const go = (history: History, to: number | null): History => {
  if (to === history.head) return history;
  if (to !== null) entryOf(history, to);
  const { store, count, next } = heldOf(history);
  return value(history.input, to, store, count, next);
};

// 3. Read
/** The entry with this id, if the History still has it. */
const entry = (history: History, id: number): Entry | undefined =>
  find(history, id);

/** The entries from the first to `to`, the Head by default. */
const line = (
  history: History,
  to: number | null = history.head,
): ReadonlyArray<Entry> => {
  const path: Array<Entry> = [];
  for (let at = to; at !== null;) {
    const entry = entryOf(history, at);
    path.push(entry);
    at = entry.parent;
  }
  return path.reverse();
};

/** The entries that follow an entry (`null`: init), oldest first. */
const children = (
  history: History,
  of: number | null,
): ReadonlyArray<Entry> => {
  const { store, count } = heldOf(history);
  const found: Array<Entry> = [];
  for (const index of store.after.get(of) ?? []) {
    if (index >= count) break;
    found.push(store.list[index]!);
  }
  return found;
};

/** The last entry of every Branch, the ones nothing follows yet, oldest first. */
const tips = (history: History): ReadonlyArray<Entry> => {
  const { store, count } = heldOf(history);
  const found: Array<Entry> = [];
  for (let index = 0; index < count; index++) {
    const entry = store.list[index]!;
    const after = store.after.get(entry.id);
    if (after === undefined || after[0]! >= count) found.push(entry);
  }
  return found;
};

/** The Snapshot right after an entry of this History, from the cache or played. */
export const snapshotOf = (
  actor: AnyActor,
  history: History,
  to: number | null,
): Snapshot =>
  replayTo(
    actor.definition,
    history.input,
    to === null ? null : entryOf(history, to),
    (id) => entryOf(history, id),
  );

// 4. Compact
/**
 * Keep only the Window on the Head's Branch, counted back from the Head:
 * `null` keeps everything, and `0` keeps no Message, only the app as it is
 * now, as one Restore. The oldest entry kept becomes a Restore of the
 * Snapshot right after it, at its Time and with its id, right after init;
 * every entry that does not grow from it, on any Branch, is gone. Never
 * moves the Head; the same History when there is nothing to fold.
 */
const compact = (
  actor: AnyActor,
  history: History,
  window: number | null,
): History => {
  checkWindow(window);
  if (window === null || history.head === null) return history;
  // The oldest entry kept: `window` back from the Head, or the Head itself
  // for 0, which still keeps the app as it is now.
  let floor = entryOf(history, history.head);
  for (let kept = 1; kept < window; kept++) {
    if (floor.parent === null) return history;
    floor = entryOf(history, floor.parent);
  }
  if (window > 0 && floor.parent === null) return history;

  const folded = fold(actor, history, floor);
  const { store, count, next } = heldOf(history);
  // Every entry that grows from the floor, ids rising.
  const kept: Array<Entry> = [];
  const waiting = [floor.id];
  const keep = new Set<number>();
  while (waiting.length > 0) {
    const id = waiting.pop()!;
    keep.add(id);
    for (const index of store.after.get(id) ?? [])
      if (index < count) waiting.push(store.list[index]!.id);
  }
  for (let index = 0; index < count; index++) {
    const entry = store.list[index]!;
    if (keep.has(entry.id)) kept.push(entry === floor ? folded : entry);
  }
  if (folded === floor && kept.length === count) return history;
  return value(history.input, history.head, storeOf(kept), kept.length, next);
};

/** An entry as the start of the History: a Restore of the Snapshot right after it, at its Time, right after init. */
const fold = (actor: AnyActor, history: History, entry: Entry): Entry => {
  if (entry.parent === null && isRestore(entry.message)) return entry;
  const snapshot = snapshotOf(actor, history, entry.id);
  const folded = restoreAt(snapshot, entry.id, entry.at);
  // The Restore puts back the very tree it was folded from.
  remember(actor.definition, history.input, folded, snapshot);
  return folded;
};

/** An entry right after init that puts the tree of `snapshot` in place at Time `at`. */
const restoreAt = (snapshot: Snapshot, id: number, at: number): Entry =>
  Object.freeze({
    id,
    parent: null,
    to: snapshot.root.address,
    message: restore(snapshot.root),
    from: { kind: 'restore' as const },
    at,
  });

/**
 * The lightest History an app can be saved as: right after init, one Restore
 * of `snapshot` at Time `at`. Nothing before it can be travelled to but
 * init, which starts from `input`.
 */
const restored = (
  snapshot: Snapshot,
  options?: { readonly input?: unknown; readonly at?: number },
): History => {
  const entry = restoreAt(snapshot, 0, options?.at ?? 0);
  return value(options?.input, 0, storeOf([entry]), 1, 1);
};

/** Throws unless a Window keeps 0 entries or more, or every one. */
export const checkWindow = (window: number | null): number | null => {
  if (window !== null && !(Number.isInteger(window) && window >= 0))
    throw new RangeError(
      `[@kestack/kabuki] a Window keeps 0 entries or more, not ${window}`,
    );
  return window;
};

// 5. Save
const saves = new WeakMap<History, SavedHistory>();

/** The History as plain JSON: the same object for the same History, and never changed itself. */
const save = (actor: AnyActor, history: History): SavedHistory => {
  const known = saves.get(history);
  if (known) return known;
  const saved: SavedHistory = Object.freeze({
    entries: Object.freeze(
      history.entries.map((entry) => encodeEntry(actor.definition, entry)),
    ),
    head: history.head,
  });
  saves.set(history, saved);
  return saved;
};

/**
 * A History saved before, read with the Actor's code as it is now, from the
 * root's Input it was played with. Throws if `saved` is not a History's
 * shape. What no longer fits the code: `'warn'`, the default, keeps it, and
 * Replay warns and skips it; `'fail'` throws at once, so a server never
 * carries on from less than it saved.
 */
const load = (
  actor: AnyActor,
  saved: SavedHistory,
  options?: {
    readonly input?: unknown;
    readonly onMismatch?: 'warn' | 'fail';
  },
): History => {
  checkSaved(saved);
  const root = actor.definition;
  if (options?.onMismatch === 'fail')
    strict(root, saved.entries, options.input, (entry) =>
      decodeEntry(root, entry),
    );
  const entries = saved.entries.map((entry) =>
    Object.freeze(decodeEntry(root, entry)),
  );
  return value(
    options?.input,
    saved.head,
    storeOf(entries),
    entries.length,
    (entries.at(-1)?.id ?? -1) + 1,
  );
};

/** What happened to an app, as plain data, and the pure functions that grow, read, fold and save it. */
export const History = {
  make,
  add,
  go,
  entry,
  line,
  children,
  tips,
  compact,
  restored,
  save,
  load,
};
