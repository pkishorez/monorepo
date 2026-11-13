import { Address, History, Snapshot } from '@kestack/kabuki';
import type {
  AnyActor,
  HistoryEntry,
  Instance,
  WantedWorker,
} from '@kestack/kabuki/types';

/*
 * What one Step did, read from the Snapshots right before and right after
 * its entry:
 *
 * 1. Played   the entry played again on the Snapshot before it, as playing
 *             is pure: what came of its Message, the Commands its Update
 *             asked for, and the Snapshot after it. Stepped from the one
 *             before, the two share every object the entry left alone;
 *             two Snapshots asked of the History apart may each be
 *             replayed, and then share none. Once per entry.
 * 2. Changes  each Instance it started, changed or stopped: one in the
 *             Snapshot after and not before is started, one in both whose
 *             State, Model or Props is another object is changed, and one
 *             before and not after is gone. An Instance a Step leaves
 *             alone is the same object in both, so only what differs is
 *             walked. The Workers it started and stopped are the ones the
 *             data asks for after it and not before, and before it and not
 *             after.
 * 3. Marks    which entry started each Instance of a Step and which last
 *             changed it, along the Branch to it: every Step's Changes,
 *             one after the other.
 * 4. Moves    which Message took an Actor from which State to which,
 *             along the Head's Branch: the Instance it was Sent to, before
 *             and after.
 * 5. Paths    where two values differ, to name what changed in a Model.
 */

// 1. Played
export interface Played {
  readonly outcome: 'handled' | 'ignored' | 'dropped';
  /** The Commands its Update asked for, by name. */
  readonly commands: ReadonlyArray<string>;
  /** The Snapshot right before the entry. */
  readonly before: Snapshot;
  /** The Snapshot right after it, stepped from `before`: what the entry left alone is the same object in both. */
  readonly after: Snapshot;
}

const played = new WeakMap<HistoryEntry, Played>();

const commandName = (command: unknown) =>
  String((command as { readonly name?: unknown }).name ?? 'command');

/** What an entry of the History did. Throws for one the History no longer keeps. */
export const playedOf = (
  actor: AnyActor,
  history: History,
  entry: HistoryEntry,
): Played => {
  const kept = played.get(entry);
  if (kept) return kept;
  const before: Snapshot = History.snapshot(actor, history, entry.parent);
  let made: Played;
  try {
    const { outcome, commands, snapshot } = Snapshot.next(actor, before, entry);
    made = {
      outcome,
      commands: commands.map(commandName),
      before,
      after: snapshot,
    };
  } catch {
    // It no longer fits the code: Replay skips it, so nothing came of it.
    made = {
      outcome: 'dropped',
      commands: [],
      before,
      after: { root: before.root, at: entry.at },
    };
  }
  played.set(entry, made);
  return made;
};

// 2. Changes
export interface Change {
  readonly kind: 'added' | 'changed' | 'removed';
  readonly before?: Instance;
  readonly after?: Instance;
}

const childrenOf = (instance: Instance): ReadonlyArray<Instance> =>
  Object.values(instance.children).flatMap((held) =>
    Snapshot.isMany(held) ? held : [held],
  );

/** An Instance and every one under it, itself first. */
const under = (instance: Instance): ReadonlyArray<Instance> => [
  instance,
  ...childrenOf(instance).flatMap(under),
];

/** Every Instance in a Snapshot, the root first. */
export const instancesOf = (snapshot: Snapshot): ReadonlyArray<Instance> =>
  under(snapshot.root);

/**
 * What the Step from `before` to `after` did, by Address, the two as
 * `playedOf` gives them: the Instances started and changed as the tree
 * after it holds them, then the ones gone. Nothing for the History's
 * start, which no entry is before.
 */
export const changesOf = (
  before: Snapshot | undefined,
  after: Snapshot,
): ReadonlyMap<string, Change> => {
  const out = new Map<string, Change>();
  if (!before) return out;
  const gone: Array<Instance> = [];
  /** One Address, as it was and as it is: an Instance left alone is the same object, with everything under it. */
  const visit = (was: Instance | undefined, is: Instance) => {
    if (was === is) return;
    if (!was) {
      for (const one of under(is))
        out.set(one.address, { kind: 'added', after: one });
      return;
    }
    if (
      was.state !== is.state ||
      was.model !== is.model ||
      was.props !== is.props
    )
      out.set(is.address, { kind: 'changed', before: was, after: is });
    const held = new Map(
      childrenOf(was).map((child) => [child.address, child]),
    );
    for (const child of childrenOf(is)) {
      visit(held.get(child.address), child);
      held.delete(child.address);
    }
    for (const child of held.values()) gone.push(...under(child));
  };
  visit(before.root, after.root);
  for (const one of gone)
    out.set(one.address, { kind: 'removed', before: one });
  return out;
};

/** A Worker as a Step names it: `name`, or `name#key` for one of `each`. */
const labelOf = ({ name, key }: WantedWorker) =>
  key === undefined ? name : `${name}#${key}`;

/** The Workers a Step started and stopped at one Instance, as the data before and after it asks for them. */
export const workersChanged = (
  actor: AnyActor,
  before: Snapshot | undefined,
  after: Snapshot,
  address: string,
): {
  readonly started: ReadonlyArray<string>;
  readonly stopped: ReadonlyArray<string>;
} => {
  const asked = (snapshot: Snapshot | undefined) =>
    new Set(
      snapshot
        ? Snapshot.workers(actor, snapshot, address as Address).map(labelOf)
        : [],
    );
  const was = asked(before);
  const is = asked(after);
  return {
    started: [...is].filter((worker) => !was.has(worker)),
    stopped: [...was].filter((worker) => !is.has(worker)),
  };
};

/** The State it left and the one it entered, when they differ. */
export const statesOf = (
  before: Instance | undefined,
  after: Instance | undefined,
): { readonly state?: readonly [string, string] } =>
  before && after && before.state._tag !== after.state._tag
    ? { state: [before.state._tag, after.state._tag] }
    : {};

// 3. Marks
/** The entries that started an Instance and last changed it; `null`: it is as the History's start has it. */
export interface Marks {
  readonly started: number | null;
  readonly changed: number | null;
}

/** Each Instance of the Step right after `to` (`null`: the History's start), by Address, with the entries that started and last changed it. */
export const marksAt = (
  actor: AnyActor,
  history: History,
  to: number | null,
): ReadonlyMap<string, Marks> => {
  const marks = new Map<string, Marks>(
    instancesOf(History.snapshot(actor, history, null)).map(({ address }) => [
      address,
      { started: null, changed: null },
    ]),
  );
  for (const entry of History.entries(history, to)) {
    const { before, after } = playedOf(actor, history, entry);
    for (const [address, { kind }] of changesOf(before, after))
      if (kind === 'removed') marks.delete(address);
      else if (kind === 'added')
        marks.set(address, { started: entry.id, changed: null });
      else
        marks.set(address, {
          started: marks.get(address)?.started ?? null,
          changed: entry.id,
        });
  }
  return marks;
};

// 4. Moves
export interface Move {
  readonly from: string;
  readonly message: string;
  readonly to: string;
  readonly count: number;
}

const moved = new WeakMap<
  HistoryEntry,
  { readonly actor: string; readonly from: string; readonly to: string } | null
>();
const movesKept = new WeakMap<
  History,
  ReadonlyMap<string, ReadonlyArray<Move>>
>();

const moveOf = (actor: AnyActor, history: History, entry: HistoryEntry) => {
  if (moved.has(entry)) return moved.get(entry)!;
  let made: { actor: string; from: string; to: string } | null = null;
  try {
    const played = playedOf(actor, history, entry);
    const before = Snapshot.at(played.before, entry.to);
    const after = Snapshot.at(played.after, entry.to);
    if (before && after && before.state._tag !== after.state._tag)
      made = {
        actor: after.actor,
        from: before.state._tag,
        to: after.state._tag,
      };
  } catch {
    made = null;
  }
  moved.set(entry, made);
  return made;
};

/** Each Actor's moves along the Head's Branch, by its name. */
export const movesOf = (
  actor: AnyActor,
  history: History,
): ReadonlyMap<string, ReadonlyArray<Move>> => {
  const kept = movesKept.get(history);
  if (kept) return kept;
  const byActor = new Map<string, Map<string, Move>>();
  for (const entry of History.entries(history)) {
    const move = moveOf(actor, history, entry);
    if (!move) continue;
    const message = entry.message._tag;
    const key = `${move.from}|${message}|${move.to}`;
    const moves = byActor.get(move.actor) ?? new Map<string, Move>();
    moves.set(key, {
      from: move.from,
      message,
      to: move.to,
      count: (moves.get(key)?.count ?? 0) + 1,
    });
    byActor.set(move.actor, moves);
  }
  const made = new Map(
    [...byActor].map(([name, moves]) => [name, [...moves.values()]]),
  );
  movesKept.set(history, made);
  return made;
};

// 5. Paths
const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

/** The paths at which two values differ, as far down as 4 levels; `·` for the whole. */
export const pathsChanged = (
  before: unknown,
  after: unknown,
  path = '',
  depth = 0,
): ReadonlyArray<string> => {
  if (Object.is(before, after)) return [];
  if (depth < 4 && isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((key) =>
      pathsChanged(
        before[key],
        after[key],
        path === '' ? key : `${path}.${key}`,
        depth + 1,
      ),
    );
  }
  return [path === '' ? '·' : path];
};

/** The value at a path `pathsChanged` names. */
export const valueAt = (value: unknown, path: string): unknown =>
  path === '·'
    ? value
    : path
        .split('.')
        .reduce<unknown>(
          (inner, key) => (isObject(inner) ? inner[key] : undefined),
          value,
        );
