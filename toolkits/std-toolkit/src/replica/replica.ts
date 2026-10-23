import { Effect } from 'effect';
import type { Scope } from 'effect';
import {
  Shape,
  type CollectionSchemas,
  type KeySchema,
  type ReplicaError,
} from './shape/index.js';
import {
  CaughtUp,
  Instances,
  NeverSynced,
  type Instance,
} from './replicas/instance/index.js';
import { Replicas } from './replicas/index.js';
import { Strategies } from './replicas/instance/strategy/index.js';

/*
 * Replica: Kabuki-native sync. This is where the pieces meet, so the low
 * ones stay low: a Shape runs nothing, and it gets `get` here, from
 * Replicas, which runs the Instances. A Build says how each Instance syncs.
 * Queries read, Actions write, and the Store in the app's Layer keeps it all.
 */

type KeyArgs<K> = [K] extends [void] ? [] : [key: K];

/** A Replica's Shape, with `get`. */
export type Replica<
  Name extends string,
  K,
  C extends CollectionSchemas,
> = Shape<Name, K, C> & {
  /**
   * The running Instance of a Key, held until the Scope closes: inside a
   * Query's `from`, an Action or a Worker, that is as long as it runs.
   */
  readonly get: (
    ...key: KeyArgs<K>
  ) => Effect.Effect<
    Instance<Shape<Name, K, C>>,
    ReplicaError,
    Replicas | Scope.Scope
  >;
};

function make<const Name extends string, const C extends CollectionSchemas>(
  name: Name,
  parts: { readonly key?: never; readonly collections: C },
): Replica<Name, void, C>;
function make<const Name extends string, K, const C extends CollectionSchemas>(
  name: Name,
  parts: { readonly key: KeySchema<K>; readonly collections: C },
): Replica<Name, K, C>;
function make(
  name: string,
  parts: {
    readonly key?: KeySchema<unknown>;
    readonly collections: CollectionSchemas;
  },
): Replica<string, any, CollectionSchemas> {
  const shape = Shape.make(
    name,
    parts as {
      readonly key: KeySchema<unknown>;
      readonly collections: CollectionSchemas;
    },
  );
  return {
    ...shape,
    get: (...key: ReadonlyArray<unknown>) =>
      Effect.flatMap(Replicas, (replicas) =>
        replicas.hold(name, shape.keyText(key[0])),
      ).pipe(
        // The Live behind an Instance carries its Collections by name, as
        // the Shape names them: this is where it is typed so.
        Effect.map(
          (live) =>
            ({
              ...live.collections,
              name: live.name,
              key: live.key,
              confirm: live.confirm,
              stopped: live.stopped,
              [CaughtUp]: live.caughtUp,
              [NeverSynced]: live.synced,
            }) as unknown as Instance<
              Shape<string, unknown, CollectionSchemas>
            >,
        ),
      ),
  };
}

/** A domain's local copy of the Backend: `make` its shapes, `build` how each Instance syncs. */
export const Replica = { make, build: Instances.build };

/** Reads the Backend from the oldest change forward, by pulling, by subscription, or both. */
export const oldToNew = Strategies.oldToNew;

/** Reads the newest page first on every open, fills in older pages, and keeps the top fresh. */
export const newToOld = Strategies.newToOld;

export { Action } from './action/index.js';
export { Query } from './query/index.js';
export { Replicas } from './replicas/index.js';
export { ReplicaError } from './shape/index.js';
export { Store } from './store/contract/index.js';
