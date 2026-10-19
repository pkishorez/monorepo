import type { Effect } from 'effect';
import type { AnyActor } from '../actor/index.ts';
import { isRestore, restore } from '../snapshot/index.ts';
import type { Envelope, Handled, Snapshot } from '../snapshot/index.ts';
import { Replay, outcomeOf } from './replay.ts';
import type { ReplayOptions } from './replay.ts';
import { checkSaved, decodeEntry, encodeEntry } from './saved.ts';

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
 * 4. Save    as plain JSON: its entries and its Head, each value as its
 *            Schema's encoded side (./saved.ts). In memory, every value is
 *            decoded.
 * 5. Compact to its Window, after every append and whenever the Window
 *            changes: the oldest entry kept becomes a Restore, and what does
 *            not grow from it is swept. Doing it twice is doing it once.
 */

/** One entry: an Envelope, and where it sits. */
export interface Entry extends Envelope {
  /** Larger than every id before it; never reused while the History lives. */
  readonly id: number;
  /** The entry before it, or `null` right after init. */
  readonly parent: number | null;
}

/**
 * A History as plain JSON, to keep and load again: every Message, and every
 * Instance of a Restore's Snapshot, as its Actor's Schemas encode it.
 */
export interface SavedHistory {
  /** Oldest first, by id. */
  readonly entries: ReadonlyArray<Entry>;
  /** The entry the next Message goes after, or `null` right after init. */
  readonly head: number | null;
}

export interface HistoryOptions extends ReplayOptions {
  /** The root's Input. */
  readonly input?: unknown;
  /** How many entries to keep on the Head's Branch; `null`, the default, keeps everything, and `0` keeps no Message, only the app as it is now. */
  readonly window?: number | null;
}

export interface History<A = AnyActor> {
  readonly actor: A;
  /** The History as plain JSON: the same object until it changes, and never changed itself. */
  readonly save: () => SavedHistory;
  readonly head: () => number | null;
  /** Whether an entry is still in the History. */
  readonly has: (entry: number) => boolean;
  /** The entries from the first to `to`, the Head by default. */
  readonly branch: (to?: number | null) => ReadonlyArray<Entry>;
  /** The entries that follow an entry (`null`: init), oldest first. */
  readonly children: (of: number | null) => ReadonlyArray<Entry>;
  /** Write an Envelope after the Head, with what came of it, and move the Head to it. */
  readonly append: (envelope: Envelope, handled: Handled) => Entry;
  /** Move the Head to an entry (`null`: init). */
  readonly moveHead: (to: number | null) => void;
  /** Forget every entry, on every Branch. The Window stays. */
  readonly clear: () => void;
  /** How many entries are kept on the Head's Branch, or `null` for every one. */
  readonly window: () => number | null;
  /** Change the Window, and Compact to it now. Allowed while a Runtime runs. */
  readonly keep: (window: number | null) => void;
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
): History<A> => open(actor, EMPTY, [], options);

/** A History saved before, read with the Actor's code as it is now. Throws if `saved` is not a History's shape. */
const load = <A extends AnyActor>(
  actor: A,
  saved: SavedHistory,
  options?: HistoryOptions,
): History<A> => {
  checkSaved(saved);
  const root = actor.definition;
  return open(
    actor,
    {
      entries: saved.entries.map((entry) => decodeEntry(root, entry)),
      head: saved.head,
    },
    saved.entries,
    options,
  );
};

/** A History of decoded entries, and those already encoded, by position. */
const open = <A extends AnyActor>(
  actor: A,
  from: SavedHistory,
  saved: ReadonlyArray<Entry>,
  options: HistoryOptions = {},
): History<A> => {
  const root = actor.definition;
  const children = new Map<number | null, Array<Entry>>();
  const outcomes = new Map<number, Handled['outcome']>();
  const listeners = new Set<() => void>();
  const entries = new Map<number, Entry>();
  let next = 0;
  /** Each entry as saved, encoded once, when first saved or as it was loaded. */
  const encoded = new Map(saved.map((entry) => [entry.id, entry]));
  let replay = Replay.make(root, options.input, options);
  let branches = new Map<number | null, ReadonlyArray<Entry>>();
  let head = from.head;
  let window = checkWindow(options.window ?? null);
  let state: SavedHistory | undefined;
  let locks = 0;

  const change = (to: number | null) => {
    head = to;
    state = undefined;
    branches = new Map();
    for (const listener of listeners) listener();
  };
  const unlocked = (what: string) => {
    if (locks > 0)
      throw new Error(
        `[@kestack/kabuki] stop the Runtime before ${what} its History`,
      );
  };
  const entryAt = (id: number) => {
    const entry = entries.get(id);
    if (!entry)
      throw new RangeError(`[@kestack/kabuki] no History entry ${id}`);
    return entry;
  };
  const add = (entry: Entry) => {
    entries.set(entry.id, entry);
    next = entry.id + 1;
    const siblings = children.get(entry.parent) ?? [];
    children.set(entry.parent, siblings);
    siblings.push(entry);
    return entry;
  };
  from.entries.forEach(add);

  // 1. Append
  const append: History<A>['append'] = (envelope, handled) => {
    const entry = add({ id: next, parent: head, ...envelope });
    outcomes.set(entry.id, handled.outcome);
    replay.remember(entry.id, handled.snapshot);
    head = entry.id;
    compact();
    change(head);
    return entry;
  };

  // 2. Move
  const moveHead: History<A>['moveHead'] = (to) => {
    unlocked('moving the Head of');
    if (to !== null) entryAt(to);
    change(to);
  };

  const clear = () => {
    unlocked('clearing');
    entries.clear();
    encoded.clear();
    next = 0;
    children.clear();
    outcomes.clear();
    replay = Replay.make(root, options.input, options);
    change(null);
  };

  // 3. Read
  const branch: History<A>['branch'] = (to = head) => {
    const known = branches.get(to);
    if (known) return known;
    const path: Array<Entry> = [];
    for (let at = to; at !== null; at = entryAt(at).parent)
      path.unshift(entryAt(at));
    branches.set(to, path);
    return path;
  };

  const outcome = (id: number) => {
    const entry = entries.get(id);
    if (!entry)
      throw new RangeError(`[@kestack/kabuki] no History entry ${id}`);
    const known =
      outcomes.get(id) ??
      outcomeOf(root, replay.at(branch(entry.parent)), entry);
    outcomes.set(id, known);
    return known;
  };

  // 4. Save
  /** A new array on every change, so one saved before never grows. */
  const save = () =>
    (state ??= {
      entries: Object.freeze(
        [...entries.values()].map((entry) => {
          const known = encoded.get(entry.id);
          if (known) return known;
          const written = encodeEntry(root, entry);
          encoded.set(entry.id, written);
          return written;
        }),
      ),
      head,
    });

  // 5. Compact
  /** The oldest entry the Window keeps on the Head's Branch, or none when the whole Branch fits. */
  const floor = () => {
    const path = branch(head);
    if (window === null || path.length === 0) return undefined;
    // Keeping nothing still keeps the app as it is now: the Head, as a Restore.
    if (window === 0) return path.at(-1);
    return path.length <= window ? undefined : path[path.length - window]!;
  };

  /** Make an entry the start of the History: a Restore of the Snapshot right after it, at its Time, after init. */
  const fold = (entry: Entry) => {
    if (entry.parent === null && isRestore(entry.message)) return;
    const snapshot = replay.at(branch(entry.id));
    const folded = restoreAt(root.name, snapshot, entry.id, entry.at);
    entries.set(entry.id, folded);
    const siblings = children.get(entry.parent) ?? [];
    siblings.splice(siblings.indexOf(entry), 1);
    children.set(null, [...(children.get(null) ?? []), folded]);
    encoded.delete(entry.id);
    outcomes.delete(entry.id);
  };

  /** Forget every entry that does not grow from `from`, on any Branch. */
  const sweep = (from: Entry) => {
    const kept = new Set<number>();
    for (const waiting = [from.id]; waiting.length > 0;) {
      const id = waiting.pop()!;
      kept.add(id);
      for (const child of children.get(id) ?? []) waiting.push(child.id);
    }
    for (const id of entries.keys())
      if (!kept.has(id)) {
        entries.delete(id);
        encoded.delete(id);
        outcomes.delete(id);
        children.delete(id);
        replay.forget(id);
      }
    children.set(null, [entries.get(from.id)!]);
  };

  /** Keep only the Window: idempotent, and it never touches the Head. */
  const compact = () => {
    const from = floor();
    if (!from) return;
    fold(from);
    sweep(entries.get(from.id)!);
    branches = new Map();
  };

  const keep: History<A>['keep'] = (to) => {
    window = checkWindow(to);
    compact();
    change(head);
  };
  compact();

  return {
    actor,
    save,
    head: () => head,
    has: (id) => entries.has(id),
    window: () => window,
    keep,
    branch,
    children: (of) => children.get(of) ?? [],
    append,
    moveHead,
    clear,
    seek: (entry = head) => replay.seek(branch(entry)),
    snapshotAt: (entry) => replay.at(branch(entry)),
    outcome,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // Counted, so two Runtimes on one History each hold it until they let go.
    lock: () => {
      locks++;
      let held = true;
      return () => {
        if (held) locks--;
        held = false;
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
  open(
    actor,
    { entries: [restoreAt(actor.definition.name, snapshot, 0, at)], head: 0 },
    [],
    options,
  );

/** An entry right after init that puts `snapshot` in place at Time `at`. */
const restoreAt = (
  root: string,
  snapshot: Snapshot,
  id: number,
  at: number,
): Entry => ({
  id,
  parent: null,
  destination: root,
  message: restore(snapshot),
  source: { kind: 'restore' },
  at,
});

const checkWindow = (window: number | null) => {
  if (window !== null && !(Number.isInteger(window) && window >= 0))
    throw new RangeError(
      `[@kestack/kabuki] a Window keeps 0 entries or more, not ${window}`,
    );
  return window;
};

export const History = { make, load, restored };

/** Tells a History from an Actor. */
export const isHistory = (value: object): value is History => 'actor' in value;
