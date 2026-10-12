import type { Effect } from 'effect';
import type { AnyActor } from '../actor/index.ts';
import { restore } from '../snapshot/index.ts';
import type { Envelope, Handled, Snapshot } from '../snapshot/index.ts';
import { Replay, outcomeOf } from './replay.ts';
import type { ReplayOptions } from './replay.ts';

/*
 * History: everything that happened to an app, as a tree of entries, one per
 * Message, and the Head the next one grows from. It needs nothing else to
 * tell the Snapshot right after any entry: it replays its own Messages.
 *
 * 1. Append  an entry after the Head, which moves to it.
 * 2. Move    the Head to an earlier entry, so the next one grows a new
 *            Branch. Not while a Runtime runs on it.
 * 3. Read    the Branch to any entry, the entries after one, the Snapshot
 *            right after one, and what came of it.
 * 4. Save    as plain JSON: its entries and its Head.
 */

/** One entry: an Envelope, and where it sits. */
export interface Entry extends Envelope {
  /** Its position in the History. */
  readonly id: number;
  /** The entry before it, or `null` right after init. */
  readonly parent: number | null;
}

/** A History as plain JSON, to keep and load again. */
export interface SavedHistory {
  /** Append-only: an entry's id is its position. */
  readonly entries: ReadonlyArray<Entry>;
  /** The entry the next Message goes after, or `null` right after init. */
  readonly head: number | null;
}

export interface HistoryOptions extends ReplayOptions {
  /** The root's Input. */
  readonly input?: unknown;
}

export interface History<A = AnyActor> {
  readonly actor: A;
  /** The History as plain JSON, the same object until it changes. */
  readonly save: () => SavedHistory;
  readonly head: () => number | null;
  /** The entries from the first to `to`, the Head by default. */
  readonly branch: (to?: number | null) => ReadonlyArray<Entry>;
  /** The entries that follow an entry (`null`: init), oldest first. */
  readonly children: (of: number | null) => ReadonlyArray<Entry>;
  /** Write an Envelope after the Head, with what came of it, and move the Head to it. */
  readonly append: (envelope: Envelope, handled: Handled) => Entry;
  /** Move the Head to an entry (`null`: init). */
  readonly moveHead: (to: number | null) => void;
  /** Forget every entry, on every Branch. */
  readonly clear: () => void;
  /** The Snapshot right after an entry, the Head by default, yielding to the page as it plays. */
  readonly seek: (entry?: number | null) => Effect.Effect<Snapshot>;
  /** The Snapshot right after an entry (`null`: init), played now. */
  readonly snapshotAt: (entry: number | null) => Snapshot;
  /** What came of an entry: worked out again when not seen live. */
  readonly outcome: (entry: number) => Handled['outcome'];
  readonly subscribe: (listener: () => void) => () => void;
  /** Keep the Head where it is while a Runtime runs on it. Call what it returns to let go. */
  readonly lock: () => () => void;
}

const EMPTY: SavedHistory = { entries: [], head: null };

const make = <A extends AnyActor>(
  actor: A,
  options?: HistoryOptions,
): History<A> => load(actor, EMPTY, options);

const load = <A extends AnyActor>(
  actor: A,
  saved: SavedHistory,
  options: HistoryOptions = {},
): History<A> => {
  const root = actor.definition;
  const children = new Map<number | null, Array<Entry>>();
  const outcomes = new Map<number, Handled['outcome']>();
  const listeners = new Set<() => void>();
  let entries: Array<Entry> = [];
  let replay = Replay.make(root, options.input, options);
  let branches = new Map<number | null, ReadonlyArray<Entry>>();
  let state: SavedHistory = EMPTY;
  let locked = false;

  const change = (head: number | null) => {
    state = { entries, head };
    branches = new Map();
    for (const listener of listeners) listener();
  };
  const unlocked = (what: string) => {
    if (locked)
      throw new Error(
        `[effect-oak] stop the Runtime before ${what} its History`,
      );
  };
  const add = (entry: Entry) => {
    entries.push(entry);
    const siblings = children.get(entry.parent) ?? [];
    children.set(entry.parent, siblings);
    siblings.push(entry);
    return entry;
  };
  saved.entries.forEach(add);
  state = { entries, head: saved.head };

  // 1. Append
  const append: History<A>['append'] = (envelope, handled) => {
    const entry = add({ id: entries.length, parent: state.head, ...envelope });
    outcomes.set(entry.id, handled.outcome);
    replay.remember(entry.id, handled.snapshot);
    change(entry.id);
    return entry;
  };

  // 2. Move
  const moveHead: History<A>['moveHead'] = (to) => {
    unlocked('moving the Head of');
    if (to !== null && !entries[to])
      throw new RangeError(`[effect-oak] no History entry ${to}`);
    change(to);
  };

  const clear = () => {
    unlocked('clearing');
    entries = [];
    children.clear();
    outcomes.clear();
    replay = Replay.make(root, options.input, options);
    change(null);
  };

  // 3. Read
  const branch: History<A>['branch'] = (to = state.head) => {
    const known = branches.get(to);
    if (known) return known;
    const path: Array<Entry> = [];
    for (let at = to; at !== null; at = entries[at]!.parent)
      path.unshift(entries[at]!);
    branches.set(to, path);
    return path;
  };

  const outcome = (id: number) => {
    const entry = entries[id];
    if (!entry) throw new RangeError(`[effect-oak] no History entry ${id}`);
    const known =
      outcomes.get(id) ??
      outcomeOf(root, replay.at(branch(entry.parent)), entry);
    outcomes.set(id, known);
    return known;
  };

  return {
    actor,
    save: () => state,
    head: () => state.head,
    branch,
    children: (of) => children.get(of) ?? [],
    append,
    moveHead,
    clear,
    seek: (entry = state.head) => replay.seek(branch(entry)),
    snapshotAt: (entry) => replay.at(branch(entry)),
    outcome,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    lock: () => {
      locked = true;
      return () => {
        locked = false;
      };
    },
  };
};

/**
 * The lightest History an app can be saved as: right after init, one Restore
 * of `snapshot` at Time `at`. Nothing before it can be travelled to but init.
 */
const restored = <A extends AnyActor>(
  actor: A,
  snapshot: Snapshot,
  at: number,
  options?: HistoryOptions,
): History<A> =>
  load(
    actor,
    {
      entries: [
        {
          id: 0,
          parent: null,
          destination: actor.definition.name,
          message: restore(snapshot),
          source: { kind: 'restore' },
          at,
        },
      ],
      head: 0,
    },
    options,
  );

export const History = { make, load, restored };

/** Tells a History from an Actor. */
export const isHistory = (value: object): value is History => 'actor' in value;
