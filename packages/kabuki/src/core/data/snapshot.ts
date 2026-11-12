import { Effect, Equal } from 'effect';
import type { AnyActor, Types } from '../actor/index.ts';
import {
  after,
  initial,
  instanceAt,
  isMany,
  isRestore,
  pathTo,
  play as playEntry,
  seekTo,
  wanted,
} from './play/index.ts';
import type { Address, Entry, Instance, Snapshot as Of } from './play/index.ts';
import { History, snapshotOf } from './history.ts';

/*
 * Reading and stepping Snapshots, purely, as a Runtime, a tool or a test
 * does: the app right after init, after one more entry, or after any entry
 * of a History; one Instance in it; and one Instance's Trail along a
 * History.
 */

export type { Instance } from './play/index.ts';

/** The whole app as one value, right after one History entry, or right after init. */
export type Snapshot<A = AnyActor> = Of<A>;
export type { Emitted, Played } from './play/index.ts';

/** One moment of an Instance's Trail, with the Instance before and after it. */
export interface Moment<A = AnyActor> {
  /** The History entry; `null` for init. */
  readonly entry: Entry | null;
  /**
   * `started` by it, `changed` by it, its State, Model or Props, `received`
   * it and changed nothing, or `stopped` by it.
   */
  readonly kind: 'started' | 'changed' | 'received' | 'stopped';
  readonly before?: Instance<A>;
  readonly after?: Instance<A>;
}

/** The app right after init, from the root's Input. */
const init = <A extends AnyActor>(
  actor: A,
  input?: Types<A>['input'],
): Snapshot<A> => initial(actor.definition, input) as Snapshot<A>;

/**
 * The Snapshot right after one more entry, and what came of it: `handled`
 * by a rule, `ignored` with none for it, or `dropped` with its Instance
 * gone; the Commands the Update asked for, and the Messages what it Emitted
 * became for the parent. Throws, changing nothing, when the Message or what
 * the Update gives does not match its Schemas.
 */
const play = <A extends AnyActor>(
  actor: A,
  snapshot: Snapshot<A>,
  entry: Entry,
) =>
  playEntry(actor.definition, snapshot, entry) as ReturnType<
    typeof playEntry
  > & { readonly snapshot: Snapshot<A> };

/** The Snapshot right after an entry of a History, the Head by default (`null`: init), played from the Messages alone. */
const replay = <A extends AnyActor>(
  actor: A,
  history: History,
  upTo: number | null = history.head,
): Snapshot<A> => snapshotOf(actor, history, upTo) as Snapshot<A>;

/** The same, yielding to the page as it plays, so a long History never freezes it. */
const seek = <A extends AnyActor>(
  actor: A,
  history: History,
  upTo: number | null = history.head,
): Effect.Effect<Snapshot<A>> =>
  Effect.suspend(
    () =>
      seekTo(
        actor.definition,
        history.input,
        upTo === null ? null : entryOf(history, upTo),
        (id) => entryOf(history, id),
      ) as Effect.Effect<Snapshot<A>>,
  );

const entryOf = (history: History, id: number): Entry => {
  const entry = History.entry(history, id);
  if (!entry) throw new RangeError(`[@kestack/kabuki] no History entry ${id}`);
  return entry;
};

/** The Instance at an Address, with everything under it, if it is in the Snapshot. */
const at = <B>(
  snapshot: Snapshot<any>,
  address: Address<B>,
): Instance<B> | undefined =>
  instanceAt(snapshot.root, address) as Instance<B> | undefined;

/**
 * One Instance's Trail along the line to an entry, the History's Head by
 * default (`null`: init): when it started, each entry that changed its
 * State, Model or Props, each other entry Sent to it, and when it stopped,
 * with the Instance before and after each.
 */
const trail = <B>(
  actor: AnyActor,
  history: History,
  address: Address<B>,
  upTo: number | null = history.head,
): ReadonlyArray<Moment<B>> => {
  const root = actor.definition;
  const moments: Array<Moment> = [];
  let snapshot = initial(root, history.input);
  let before = instanceAt(snapshot.root, address);
  if (before) moments.push({ entry: null, kind: 'started', after: before });
  for (const entry of History.line(history, upTo)) {
    snapshot = after(root, history.input, snapshot, entry);
    const now = instanceAt(snapshot.root, address);
    const moment = momentOf(entry, address, before, now);
    if (moment) moments.push(moment);
    before = now;
  }
  return moments as ReadonlyArray<Moment<any>>;
};

const momentOf = (
  entry: Entry,
  address: string,
  before: Instance | undefined,
  now: Instance | undefined,
): Moment | undefined => {
  if (!before && now) return { entry, kind: 'started', after: now };
  if (before && !now) return { entry, kind: 'stopped', before };
  if (!before || !now) return undefined;
  const changed = isRestore(entry.message)
    ? !Equal.equals(dataOf(before), dataOf(now))
    : before.state !== now.state ||
      before.model !== now.model ||
      before.props !== now.props;
  if (changed) return { entry, kind: 'changed', before, after: now };
  return entry.to === address
    ? { entry, kind: 'received', before, after: now }
    : undefined;
};

const dataOf = ({ state, model, props }: Instance) => ({ state, model, props });

/** One Worker the data asks for at an Instance: its name, and the key it runs for if it is one of `each`. */
export interface WantedWorker {
  readonly name: string;
  readonly key?: string;
}

/**
 * The Workers the data asks for at an Instance, from the Snapshot and the
 * root's Actor alone: the ones a running Runtime runs there, by the same rule,
 * whatever each is doing. None for an Instance not in the Snapshot.
 */
const workers = (
  actor: AnyActor,
  snapshot: Snapshot<any>,
  address: Address<any>,
): ReadonlyArray<WantedWorker> => {
  const at = pathTo(actor.definition, snapshot.root, address)?.at(-1);
  if (!at) return [];
  const { definition, instance } = at;
  return wanted(definition.workers, dataOf(instance)).flatMap(([name, keys]) =>
    definition.workers[name]!.kind === 'each'
      ? keys.map((key) => ({ name, key }))
      : keys.map(() => ({ name })),
  );
};

/** The whole app as one value, and the pure functions that make, step and read it. */
export const Snapshot = {
  init,
  play,
  replay,
  seek,
  at,
  trail,
  workers,
  isMany,
};
