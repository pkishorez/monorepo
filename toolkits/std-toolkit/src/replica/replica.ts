import { Effect } from 'effect';
import type { Scope } from 'effect';
import {
  Definition,
  type CollectionSchemas,
  type KeySchema,
  type ReplicaError,
} from './definition/index.js';
import { Instances, type Instance } from './instance/index.js';
import { Replicas } from './replicas/index.js';
import { Strategies } from './strategy/index.js';

/*
 * Replica: Kabuki-native sync. This is where the pieces meet, so the low
 * ones stay low: a Definition is only shapes, and it gets `get` here, from
 * Replicas, which runs the Instances. A Build says how each Instance syncs.
 * Queries read, Actions write, and the Store in the app's Layer keeps it all.
 */

type KeyArgs<K> = [K] extends [void] ? [] : [key: K];

/** A Replica's Definition, with `get`. */
export type Replica<
  Name extends string,
  K,
  C extends CollectionSchemas,
> = Definition<Name, K, C> & {
  /**
   * The running Instance of a Key, held until the Scope closes: inside a
   * Query's `from`, an Action or a Worker, that is as long as it runs.
   */
  readonly get: (
    ...key: KeyArgs<K>
  ) => Effect.Effect<
    Instance<Definition<Name, K, C>>,
    ReplicaError,
    Replicas | Scope.Scope
  >;
};

function define<const Name extends string, const C extends CollectionSchemas>(
  name: Name,
  shape: { readonly key?: never; readonly collections: C },
): Replica<Name, void, C>;
function define<
  const Name extends string,
  K,
  const C extends CollectionSchemas,
>(
  name: Name,
  shape: { readonly key: KeySchema<K>; readonly collections: C },
): Replica<Name, K, C>;
function define(
  name: string,
  shape: {
    readonly key?: KeySchema<unknown>;
    readonly collections: CollectionSchemas;
  },
): Replica<string, any, CollectionSchemas> {
  const definition = Definition.define(
    name,
    shape as {
      readonly key: KeySchema<unknown>;
      readonly collections: CollectionSchemas;
    },
  );
  return {
    ...definition,
    get: (...key: ReadonlyArray<unknown>) =>
      Effect.flatMap(Replicas, (replicas) =>
        replicas.hold(name, definition.keyText(key[0])),
      ).pipe(
        // The Live behind an Instance carries its Collections by name, as
        // the Definition names them: this is where it is typed so.
        Effect.map(
          (live) =>
            ({
              ...live.collections,
              name: live.name,
              key: live.key,
              confirm: live.confirm,
              stopped: live.stopped,
            }) as unknown as Instance<
              Definition<string, unknown, CollectionSchemas>
            >,
        ),
      ),
  };
}

/** A domain's local copy of the Backend: `define` its shapes, `build` how each Instance syncs. */
export const Replica = { define, build: Instances.build };

/** Reads the Backend from the oldest change forward, by pulling, by subscription, or both. */
export const oldToNew = Strategies.oldToNew;

/** Reads the newest page first on every open, fills in older pages, and keeps the top fresh. */
export const newToOld = Strategies.newToOld;

export { Action } from './action/index.js';
export { Query } from './query/index.js';
export { Replicas } from './replicas/index.js';
export { ReplicaError } from './definition/index.js';
export { Store } from './store/contract/index.js';
