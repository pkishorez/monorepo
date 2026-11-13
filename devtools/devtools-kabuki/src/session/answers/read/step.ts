import { Address, History, Snapshot } from '@kestack/kabuki';
import type {
  AnyActor,
  Entry,
  Instance,
  WantedWorker,
} from '@kestack/kabuki/types';

/*
 * What one Step did, as Kabuki says it, never worked out again here:
 *
 * 1. Played   what came of its Message and the Commands its Update asked
 *             for: the entry played again on the Snapshot before it, as
 *             playing is pure. Once per entry.
 * 2. Changes  each Instance it started, changed or stopped: an Instance
 *             says which entry started it and which last changed it, and
 *             one in the Snapshot before and not after is gone. The
 *             Workers it started and stopped are the ones the data asks
 *             for after it and not before, and before it and not after.
 * 3. Moves    which Message took an Actor from which State to which,
 *             along the Head's Branch: the Instance it was Sent to, before
 *             and after.
 * 4. Paths    where two values differ, to name what changed in a Model.
 */

// 1. Played
export interface Played {
  readonly outcome: 'handled' | 'ignored' | 'dropped';
  /** The Commands its Update asked for, by name. */
  readonly commands: ReadonlyArray<string>;
}

const played = new WeakMap<Entry, Played>();

const commandName = (command: unknown) =>
  String((command as { readonly name?: unknown }).name ?? 'command');

export const playedOf = (
  actor: AnyActor,
  history: History,
  entry: Entry,
): Played => {
  const kept = played.get(entry);
  if (kept) return kept;
  let made: Played;
  try {
    const before = Snapshot.replay(actor, history, entry.parent);
    const { outcome, commands } = Snapshot.play(actor, before, entry);
    made = { outcome, commands: commands.map(commandName) };
  } catch {
    // It no longer fits the code: Replay skips it, so nothing came of it.
    made = { outcome: 'dropped', commands: [] };
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

/** Every Instance in a Snapshot, by Address, the root first. */
export const instancesOf = (snapshot: Snapshot): ReadonlyArray<Instance> => {
  const out: Array<Instance> = [];
  const visit = (instance: Instance) => {
    out.push(instance);
    for (const held of Object.values(instance.children))
      if (Snapshot.isMany(held)) held.forEach(visit);
      else visit(held);
  };
  visit(snapshot.root);
  return out;
};

const byAddress = (snapshot: Snapshot | undefined) =>
  new Map(
    snapshot
      ? instancesOf(snapshot).map((instance) => [instance.address, instance])
      : [],
  );

/** What the entry `after` is right after did, by Address: nothing for init. */
export const changesOf = (
  before: Snapshot | undefined,
  after: Snapshot,
): ReadonlyMap<string, Change> => {
  const out = new Map<string, Change>();
  const id = after.entry;
  if (id === null) return out;
  const was = byAddress(before);
  const is = byAddress(after);
  for (const [address, now] of is)
    if (now.started === id) out.set(address, { kind: 'added', after: now });
    else if (now.changed === id)
      out.set(address, {
        kind: 'changed',
        ...(was.has(address) ? { before: was.get(address)! } : {}),
        after: now,
      });
  for (const [address, then] of was)
    if (!is.has(address)) out.set(address, { kind: 'removed', before: then });
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

// 3. Moves
export interface Move {
  readonly from: string;
  readonly message: string;
  readonly to: string;
  readonly count: number;
}

const moved = new WeakMap<
  Entry,
  { readonly actor: string; readonly from: string; readonly to: string } | null
>();
const movesKept = new WeakMap<
  History,
  ReadonlyMap<string, ReadonlyArray<Move>>
>();

const moveOf = (actor: AnyActor, history: History, entry: Entry) => {
  if (moved.has(entry)) return moved.get(entry)!;
  let made: { actor: string; from: string; to: string } | null = null;
  if (entry.from.kind !== 'restore')
    try {
      const to = entry.to as Address;
      const before = Snapshot.at(
        Snapshot.replay(actor, history, entry.parent),
        to,
      );
      const after = Snapshot.at(Snapshot.replay(actor, history, entry.id), to);
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
  for (const entry of History.line(history)) {
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

// 4. Paths
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
