import { Context, Deferred, Effect, Layer, Stream } from 'effect';
import type { Scope } from 'effect';
import {
  partsOf,
  ReplicaError,
  type Definition,
} from '../../definition/index.js';
import {
  cursorOf,
  readAfter,
  write,
  type Cursor,
  type SpaceTable,
  type Wire,
  type Written,
} from './space.js';

export { SPACE_TABLE, space as spaceTable } from './layout.js';
export type { Cursor, SpaceTable, Wire, Written };

/*
 * The Store: where Instances are kept on this device, the only truth there.
 * It opens one space per Instance, named by the Instance, and hides what
 * keeping tabs in agreement takes: the Leader, the Doorbell, and the newer
 * `_u` winning every write.
 *
 * 1. Open    a space, for as long as a Scope lasts: read it, write it,
 *            hear when it changed, lead it, learn it is being removed.
 * 2. Remove  an Instance: everyone who opened it is told to stop, and it
 *            is deleted once the ones here have.
 * 3. Retire  Replicas no app reads any more: deleted as the Store starts.
 *
 * An adapter says where the spaces live and how participants share them.
 */

/** Runs an effect only while this participant leads `name`, waiting for it first. */
export type Leader = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>,
) => Effect.Effect<A, E, R>;

/** Tells other participants a topic changed. It carries nothing: they read the Store again. */
export interface Doorbell {
  readonly ring: (topic: string) => Effect.Effect<void>;
  /** `initial` rings once after subscribing, so a read before subscribing cannot miss a write. */
  readonly listen: (topic: string, initial?: boolean) => Stream.Stream<void>;
}

/** Where an adapter keeps spaces, and how participants share them. */
export interface Adapter {
  readonly table: (name: string) => SpaceTable;
  /** The name of every space kept. */
  readonly names: Effect.Effect<ReadonlyArray<string>, unknown>;
  readonly destroy: (name: string) => Effect.Effect<void, unknown>;
  readonly leader: Leader;
  readonly doorbell: Doorbell;
}

/** One Instance's space, open. */
export interface Space {
  readonly name: string;
  /** A Collection's records written after a position (`null`: all), and the position after them. */
  readonly read: (
    collection: string,
    after: string | null,
  ) => Effect.Effect<
    { readonly records: ReadonlyArray<Wire>; readonly position: string },
    ReplicaError
  >;
  readonly cursor: (
    collection: string,
  ) => Effect.Effect<Cursor | null, ReplicaError>;
  /** Keeps the newer `_u` of each record and the cursors, then rings the Doorbell if anything changed. */
  readonly write: (
    written: ReadonlyArray<Written>,
  ) => Effect.Effect<void, ReplicaError>;
  /** A ring each time any participant changed this space. */
  readonly changes: Stream.Stream<void>;
  /** Runs an effect only while this participant is its Leader. */
  readonly lead: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
  /** Waits until the Store is asked to remove this space. */
  readonly removed: Effect.Effect<void>;
}

type KeyArgs<K> = [K] extends [void] ? [] : [key: K];

export interface StoreShape {
  readonly open: (name: string) => Effect.Effect<Space, never, Scope.Scope>;
  /** Every Instance kept, by its Replica's name and its Key as text. */
  readonly list: Effect.Effect<
    ReadonlyArray<{ readonly replica: string; readonly key: string }>,
    ReplicaError
  >;
  /** Stops every Instance of this Replica and Key, here and in other tabs, then deletes it. */
  readonly remove: <K>(
    replica: Definition<string, K, any>,
    ...key: KeyArgs<K>
  ) => Effect.Effect<void, ReplicaError>;
}

/** Where Instances are kept on this device. Give it in the app's Layer: `Store.idb()` or `Store.memory()`. */
export class Store extends Context.Service<Store, StoreShape>()(
  '@kestack/std-toolkit/replica/Store',
) {}

const failed = (what: string) => (cause: unknown) =>
  new ReplicaError({ message: `The Store failed to ${what}`, cause });

const removedTopic = (name: string) => `${name}#removed`;

/** Someone who opened a space here: told when it is removed, and done once their Scope closes. */
interface Opener {
  readonly removed: Deferred.Deferred<void>;
  readonly closed: Deferred.Deferred<void>;
}

export interface StoreOptions {
  /** Replicas no app reads any more: every Instance of them is deleted as the Store starts. */
  readonly retired?: ReadonlyArray<string | { readonly name: string }>;
}

/** A Store over an adapter. Made once, so every app given the Layer shares who opened what. */
export const makeStore = (
  adapter: Adapter,
  options: StoreOptions = {},
): Layer.Layer<Store> => {
  const openers = new Map<string, Set<Opener>>();

  // 1. Open
  const open = (name: string) =>
    Effect.gen(function* () {
      const table = adapter.table(name);
      const opener: Opener = {
        removed: yield* Deferred.make<void>(),
        closed: yield* Deferred.make<void>(),
      };
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const here = openers.get(name) ?? new Set();
          openers.set(name, here.add(opener));
        }),
        () =>
          Effect.sync(() => openers.get(name)?.delete(opener)).pipe(
            Effect.andThen(Deferred.succeed(opener.closed, undefined)),
          ),
      );
      const changed = adapter.doorbell.ring(name);
      return {
        name,
        read: (collection, after) =>
          readAfter(collection, after).pipe(
            Effect.provide(table),
            Effect.mapError(failed(`read ${name}`)),
          ),
        cursor: (collection) =>
          cursorOf(collection).pipe(
            Effect.provide(table),
            Effect.mapError(failed(`read a cursor of ${name}`)),
          ),
        write: (written) =>
          write(written).pipe(
            Effect.provide(table),
            Effect.mapError(failed(`write ${name}`)),
            Effect.flatMap((wrote) => (wrote ? changed : Effect.void)),
          ),
        changes: adapter.doorbell.listen(name, true),
        lead: (effect) => adapter.leader(name, effect),
        removed: Effect.raceFirst(
          Deferred.await(opener.removed),
          Stream.runHead(adapter.doorbell.listen(removedTopic(name))),
        ).pipe(Effect.asVoid),
      } satisfies Space;
    });

  // 2. Remove
  const destroy = (name: string) =>
    Effect.gen(function* () {
      yield* adapter.doorbell.ring(removedTopic(name));
      const here = [...(openers.get(name) ?? [])];
      for (const opener of here)
        yield* Deferred.succeed(opener.removed, undefined);
      yield* Effect.forEach(here, (opener) => Deferred.await(opener.closed), {
        discard: true,
      });
      yield* adapter
        .destroy(name)
        .pipe(Effect.mapError(failed(`delete ${name}`)));
    });

  const list = adapter.names.pipe(
    Effect.map((names) => names.map(partsOf)),
    Effect.mapError(failed('list what it keeps')),
  );

  const store: StoreShape = {
    open,
    list,
    // With no Key there is none to pass, and the name is the Replica's.
    remove: (replica, ...key) =>
      destroy(
        replica.instanceName(
          key[0] as Parameters<typeof replica.instanceName>[0],
        ),
      ),
  };

  // 3. Retire
  const retired = new Set(
    (options.retired ?? []).map((each) =>
      typeof each === 'string' ? each : each.name,
    ),
  );
  const retire = Effect.gen(function* () {
    if (retired.size === 0) return;
    for (const name of yield* adapter.names)
      if (retired.has(partsOf(name).replica)) yield* adapter.destroy(name);
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning(
        '[@kestack/std-toolkit/replica] could not delete the retired Replicas',
        error,
      ),
    ),
  );

  return Layer.effect(Store, Effect.as(retire, store));
};
