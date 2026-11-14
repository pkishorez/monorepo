import { Effect } from 'effect';
import type { AnyActor } from '../actor/index.ts';
import { Snapshot } from '../snapshot/index.ts';
import type { Entry } from '../snapshot/index.ts';
import { recall, remember, replayTo, replayingTo, strict } from './replay.ts';
import type { HistoryEntry } from './replay.ts';
import { checkSaved, decodeEntry, encodeEntry } from './saved.ts';
import type { SavedHistory } from './saved.ts';

/*
 * History: what happened to an app, as a starting Snapshot and a tree of
 * entries after it, one per Message, each pointing to the entry before it,
 * and the Head the next one grows from. A plain, immutable value: every
 * function gives a new one and leaves the one it was given as it was.
 *
 * A History knows no Runtime. A Runtime tells whoever listens the entries
 * it played, which are added here; and a Snapshot read from here is one a
 * Runtime can follow.
 *
 * 1. Add       entries after the Head, which moves to the last. After an
 *              entry that already has one after it, they grow a new Branch.
 * 2. Move      the Head to any entry, or to the start.
 * 3. Read      the entries on the way to any one, every entry on every
 *              Branch, the entries that follow one, and the last of every
 *              Branch.
 * 4. Snapshot  the app right after any entry, played from the start and
 *              the Messages alone (./replay.ts).
 * 5. Compact   to a Window: the start moves forward to the Snapshot right
 *              before the oldest entry kept, and what does not grow from
 *              it is swept. Doing it twice is doing it once.
 * 6. Save      as plain JSON, every value as its Schema's encoded side
 *              (./saved.ts), and load it again with the code as it is now.
 *
 * Growing is cheap: a History shares its entries with the one it grew
 * from.
 */

export type { HistoryEntry } from './replay.ts';
export type { SavedHistory } from './saved.ts';

export interface History {
  /** The Snapshot it starts from: what every entry is played after. */
  readonly start: Snapshot;
  /** The entry the next Message goes after, or `null` at the start. */
  readonly head: number | null;
}

/** The entries one or more Histories hold, only ever added to. */
interface Store {
  readonly list: Array<HistoryEntry>;
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

const storeOf = (entries: ReadonlyArray<HistoryEntry>): Store => {
  const store: Store = { list: [], at: new Map(), after: new Map() };
  for (const entry of entries) push(store, entry);
  return store;
};

const push = (store: Store, entry: HistoryEntry) => {
  store.at.set(entry.id, store.list.length);
  const siblings = store.after.get(entry.parent) ?? [];
  store.after.set(entry.parent, siblings);
  siblings.push(store.list.length);
  store.list.push(entry);
};

const value = (
  start: Snapshot,
  head: number | null,
  store: Store,
  count: number,
  next: number,
): History => {
  const history: History = Object.freeze({ start, head });
  held.set(history, { store, count, next });
  return history;
};

const heldOf = (history: History): Held => {
  const known = held.get(history);
  if (!known)
    throw new TypeError(
      '[@kestack/kabuki] not a History: make one with History.init or History.load',
    );
  return known;
};

const find = (history: History, id: number): HistoryEntry | undefined => {
  const { store, count } = heldOf(history);
  const index = store.at.get(id);
  return index !== undefined && index < count ? store.list[index] : undefined;
};

/** The entry with this id; throws if the History has none. */
const entryOf = (history: History, id: number): HistoryEntry => {
  const entry = find(history, id);
  if (!entry) throw new RangeError(`[@kestack/kabuki] no History entry ${id}`);
  return entry;
};

/** A History with no entries, starting from a Snapshot. */
const init = (start: Snapshot<any>): History =>
  value(start as Snapshot, null, storeOf([]), 0, 0);

// 1. Add
/** Write entries after the Head, in order, and move the Head to the last. */
const add = (
  history: History,
  entries: Entry | ReadonlyArray<Entry>,
): History => {
  const written = Array.isArray(entries)
    ? (entries as ReadonlyArray<Entry>)
    : [entries as Entry];
  if (written.length === 0) return history;
  const { store, count, next } = heldOf(history);
  // The newest History on its Store adds in place; an older one copies first.
  const own =
    count === store.list.length ? store : storeOf(store.list.slice(0, count));
  let head = history.head;
  let id = next;
  for (const { to, message, from, at } of written) {
    push(own, Object.freeze({ id, parent: head, to, message, from, at }));
    head = id++;
  }
  return value(history.start, head, own, count + written.length, id);
};

// 2. Move
/** The same History with its Head at an entry (`null`: the start), so the next one grows from there. */
const move = (history: History, to: number | null): History => {
  if (to === history.head) return history;
  if (to !== null) entryOf(history, to);
  const { store, count, next } = heldOf(history);
  return value(history.start, to, store, count, next);
};

// 3. Read
/** The entry with this id, if the History still has it. */
const entry = (history: History, id: number): HistoryEntry | undefined =>
  find(history, id);

/** The entries from the start to `to`, the Head by default, oldest first: a plain list, to filter as any other. */
const entries = (
  history: History,
  to: number | null = history.head,
): ReadonlyArray<HistoryEntry> => {
  const path: Array<HistoryEntry> = [];
  for (let at = to; at !== null;) {
    const entry = entryOf(history, at);
    path.push(entry);
    at = entry.parent;
  }
  return path.reverse();
};

/** Every entry, on every Branch, oldest first. */
const all = (history: History): ReadonlyArray<HistoryEntry> => {
  const { store, count } = heldOf(history);
  return store.list.slice(0, count);
};

/** The entries that follow an entry (`null`: the start), oldest first. */
const children = (
  history: History,
  of: number | null,
): ReadonlyArray<HistoryEntry> => {
  const { store, count } = heldOf(history);
  const found: Array<HistoryEntry> = [];
  for (const index of store.after.get(of) ?? []) {
    if (index >= count) break;
    found.push(store.list[index]!);
  }
  return found;
};

/** The last entry of every Branch, the ones nothing follows yet, oldest first. */
const tips = (history: History): ReadonlyArray<HistoryEntry> => {
  const { store, count } = heldOf(history);
  const found: Array<HistoryEntry> = [];
  for (let index = 0; index < count; index++) {
    const entry = store.list[index]!;
    const after = store.after.get(entry.id);
    if (after === undefined || after[0]! >= count) found.push(entry);
  }
  return found;
};

// 4. Snapshot
/** The Snapshot right after an entry, the Head by default (`null`: the start), played from the Messages alone. */
const snapshot = <A extends AnyActor>(
  actor: A,
  history: History,
  to: number | null = history.head,
): Snapshot<A> =>
  replayTo(
    actor.definition,
    history.start,
    to === null ? null : entryOf(history, to),
    (id) => entryOf(history, id),
  ) as Snapshot<A>;

/** The same, yielding to the page as it plays, so a long History never freezes it. */
const replay = <A extends AnyActor>(
  actor: A,
  history: History,
  to: number | null = history.head,
): Effect.Effect<Snapshot<A>> =>
  Effect.suspend(
    () =>
      replayingTo(
        actor.definition,
        history.start,
        to === null ? null : entryOf(history, to),
        (id) => entryOf(history, id),
      ) as Effect.Effect<Snapshot<A>>,
  );

// 5. Compact
/**
 * Keep only the Window on the Head's Branch, counted back from the Head:
 * `null` keeps everything, and `0` keeps no entry, only the app as it is
 * now, as the start. The start moves forward to the Snapshot right before
 * the oldest entry kept; every entry that does not grow from there, on any
 * Branch, is gone. The entries kept keep their ids; the same History when
 * there is nothing to fold.
 */
const compact = (
  actor: AnyActor,
  history: History,
  window: number | null,
): History => {
  checkWindow(window);
  if (window === null || history.head === null) return history;
  // The last entry folded into the start: `window` back from the Head.
  let floor = entryOf(history, history.head);
  for (let kept = 0; kept < window; kept++) {
    if (floor.parent === null) return history;
    floor = entryOf(history, floor.parent);
  }

  const root = actor.definition;
  const start = snapshot(actor, history, floor.id) as Snapshot;
  const { store, count, next } = heldOf(history);
  // Every entry that grows from the floor, ids rising.
  const keep = new Set<number>();
  const waiting = [floor.id];
  while (waiting.length > 0) {
    const id = waiting.pop()!;
    for (const index of store.after.get(id) ?? [])
      if (index < count) {
        const { id: after } = store.list[index]!;
        keep.add(after);
        waiting.push(after);
      }
  }
  const kept: Array<HistoryEntry> = [];
  for (let index = 0; index < count; index++) {
    const entry = store.list[index]!;
    if (!keep.has(entry.id)) continue;
    const moved =
      entry.parent === floor.id
        ? Object.freeze({ ...entry, parent: null })
        : entry;
    // What was played after it holds from the new start too.
    const after = recall(root, history.start, entry);
    if (after) remember(root, start, moved, after);
    kept.push(moved);
  }
  return value(
    start,
    history.head === floor.id ? null : history.head,
    storeOf(kept),
    kept.length,
    next,
  );
};

/** Throws unless a Window keeps 0 entries or more, or every one. */
const checkWindow = (window: number | null): number | null => {
  if (window !== null && !(Number.isInteger(window) && window >= 0))
    throw new RangeError(
      `[@kestack/kabuki] a Window keeps 0 entries or more, not ${window}`,
    );
  return window;
};

// 6. Save
const saves = new WeakMap<History, SavedHistory>();

/** The History as plain JSON: the same object for the same History, and never changed itself. */
const save = (actor: AnyActor, history: History): SavedHistory => {
  const known = saves.get(history);
  if (known) return known;
  const saved: SavedHistory = Object.freeze({
    start: Snapshot.save(actor, history.start),
    entries: Object.freeze(
      all(history).map((entry) => encodeEntry(actor.definition, entry)),
    ),
    head: history.head,
  });
  saves.set(history, saved);
  return saved;
};

/**
 * A History saved before, read with the Actor's code as it is now. Throws
 * if `saved` is not a History's shape, or if its start no longer fits the
 * code. An entry that no longer fits: `'warn'`, the default, keeps it, and
 * Replay warns and skips it; `'fail'` throws at once, so a server never
 * carries on from less than it saved.
 */
const load = (
  actor: AnyActor,
  saved: SavedHistory,
  options?: { readonly onMismatch?: 'warn' | 'fail' },
): History => {
  checkSaved(saved);
  const root = actor.definition;
  const start = Snapshot.load(actor, saved.start) as Snapshot;
  if (options?.onMismatch === 'fail')
    strict(root, start, saved.entries, (entry) => decodeEntry(root, entry));
  const entries = saved.entries.map((entry) =>
    Object.freeze(decodeEntry(root, entry)),
  );
  return value(
    start,
    saved.head,
    storeOf(entries),
    entries.length,
    (entries.at(-1)?.id ?? -1) + 1,
  );
};

/** What happened to an app, as plain data, and the pure functions that grow, read, replay, fold and save it. */
export const History = {
  init,
  add,
  move,
  entry,
  entries,
  all,
  children,
  tips,
  snapshot,
  replay,
  compact,
  save,
  load,
};
