import type { AnyActor, Types } from '../actor/index.ts';
import type { Address } from './address/index.ts';
import { instanceAt, isMany, pathTo, wanted } from './instance/index.ts';
import type { Instance, Snapshot as Of } from './instance/index.ts';
import { initial, next as nextOf } from './next/index.ts';
import type { Entry, Played } from './next/index.ts';
import { load as loadSaved, save as saveOf } from './saved.ts';
import type { SavedSnapshot } from './saved.ts';

/*
 * The Snapshot: the whole app as one plain value, and the pure functions
 * that make, step, read and save it. Nothing here runs an Effect.
 *
 *   Definition + Input   ──init──▶  Snapshot
 *   Snapshot + entry     ──next──▶  the next Snapshot
 */

/** The whole app as one value: every Instance, and the app's Time. */
export type Snapshot<A = AnyActor> = Of<A>;

/** The app right after init, from the root's Input. The same value each time it is asked with the same Input. */
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
const next = <A extends AnyActor>(
  actor: A,
  snapshot: Snapshot<A>,
  entry: Entry,
) =>
  nextOf(actor.definition, snapshot as Snapshot, entry) as Omit<
    Played,
    'snapshot'
  > & { readonly snapshot: Snapshot<A> };

/** The Instance at an Address, with everything under it, if it is in the Snapshot. */
const at = <B>(
  snapshot: Snapshot<any>,
  address: Address<B>,
): Instance<B> | undefined =>
  instanceAt(snapshot.root, address) as Instance<B> | undefined;

/** One Worker the data asks for at an Instance: its name, and the key it runs for if it is one of `each`. */
export interface WantedWorker {
  readonly name: string;
  readonly key?: string;
}

/**
 * The Workers the data asks for at an Instance, from the Snapshot and the
 * root's Actor alone: the ones a Runtime runs there, by the same rule,
 * whatever each is doing. None for an Instance not in the Snapshot.
 */
const workers = (
  actor: AnyActor,
  snapshot: Snapshot<any>,
  address: Address<any>,
): ReadonlyArray<WantedWorker> => {
  const found = pathTo(actor.definition, snapshot.root, address)?.at(-1);
  if (!found) return [];
  const { definition, instance } = found;
  const { state, model, props } = instance;
  return wanted(definition.workers, { state, model, props }).flatMap(
    ([name, keys]) =>
      definition.workers[name]!.kind === 'each'
        ? keys.map((key) => ({ name, key }))
        : keys.map(() => ({ name })),
  );
};

/** The Snapshot as plain JSON, every value as its Actor's Schemas encode it: the same object for the same Snapshot. */
const save = <A extends AnyActor>(
  actor: A,
  snapshot: Snapshot<A>,
): SavedSnapshot => saveOf(actor.definition, snapshot as Snapshot);

/** A Snapshot saved before, read with the Actor's code as it is now. Throws, saying why, if it no longer fits the code. */
const load = <A extends AnyActor>(
  actor: A,
  saved: SavedSnapshot,
): Snapshot<A> => loadSaved(actor.definition, saved) as Snapshot<A>;

/** The whole app as one value, and the pure functions that make, step, read and save it. */
export const Snapshot = { init, next, at, workers, isMany, save, load };
