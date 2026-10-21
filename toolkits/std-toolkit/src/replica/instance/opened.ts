import type { Collection } from '@tanstack/db';
import { Deferred, Effect, Queue, Semaphore, Stream } from 'effect';
import type { Scope } from 'effect';
import { ReplicaError, type AnyDefinition } from '../definition/index.js';
import type { Space, Wire, Written } from '../store/contract/index.js';
import { reader, showCollections, type Read } from './collections.js';
import type { Message } from './model.js';

/*
 * One Instance, open on this participant: its space in the Store and the
 * Collections that show it. Everything that reaches the Store goes through
 * here, so the Collections never show what the Store does not hold.
 *
 * 1. Load     the space into the Collections before anyone reads them.
 * 2. Refresh  what changed since, in the order it was written: after this
 *             participant writes, and each time the Doorbell rings.
 * 3. Keep     what a Strategy read or the Backend confirmed: checked
 *             against the ESchemas, written to the Store, then shown.
 */

/** What a Query, a Worker or an Action holds of a running Instance. */
export interface Live {
  readonly name: string;
  readonly key: unknown;
  readonly collections: Readonly<Record<string, Collection<object, string>>>;
  /** Puts what the Backend returned in the Store, in place of the Optimistic Changes it answers. */
  readonly confirm: (
    entities: ReadonlyArray<Wire>,
  ) => Effect.Effect<void, ReplicaError>;
  /** Waits until the Instance stops: its Collections no longer follow the Store. */
  readonly stopped: Effect.Effect<void>;
  /** Counts an Action as under way on this Instance until the Scope closes. */
  readonly track: (action: string) => Effect.Effect<void, never, Scope.Scope>;
}

export interface Opened {
  readonly live: Live;
  readonly space: Space;
  readonly refresh: Effect.Effect<void, ReplicaError>;
  /** What a Strategy read for one Collection: checked, and kept with its cursor. */
  readonly keep: (
    collection: string,
    entities: ReadonlyArray<Wire>,
    cursor: Written['cursor'],
  ) => Effect.Effect<'kept' | 'outdated', ReplicaError>;
  /** The Messages the Instance's own work sends it: Actions beginning and ending. */
  readonly messages: Stream.Stream<Message>;
}

const warn = (name: string, read: ReadonlyArray<Read>) =>
  Effect.forEach(
    read,
    (each) =>
      each._tag === 'Outdated'
        ? Effect.logWarning(
            `[@kestack/std-toolkit/replica] ${name}: an Entity at version ${each.version} is newer than this app knows; it is left out until the app updates`,
          )
        : each._tag === 'Invalid'
          ? Effect.logWarning(
              `[@kestack/std-toolkit/replica] ${name}: an Entity does not match its ESchema and is left out: ${each.message}`,
            )
          : Effect.void,
    { discard: true },
  );

export const openInstance = (
  definition: AnyDefinition,
  key: unknown,
  space: Space,
): Effect.Effect<Opened, ReplicaError, Scope.Scope> =>
  Effect.gen(function* () {
    const { name } = space;
    const readers = Object.fromEntries(
      Object.entries(definition.collections).map(([collection, schema]) => [
        collection,
        reader(schema),
      ]),
    );
    const byEntity = new Map(
      Object.entries(definition.collections).map(([collection, schema]) => [
        schema.name,
        collection,
      ]),
    );
    const shown = showCollections(definition, name);
    const positions = new Map<string, string>();
    const reading = yield* Semaphore.make(1);
    const messages = yield* Queue.unbounded<Message>();
    const stopped = yield* Deferred.make<void>();
    yield* Effect.addFinalizer(() =>
      Effect.andThen(Deferred.succeed(stopped, undefined), shown.cleanup),
    );

    // 2. Refresh
    const refresh = reading.withPermit(
      Effect.forEach(
        Object.keys(definition.collections),
        (collection) =>
          Effect.gen(function* () {
            const after = positions.get(collection) ?? null;
            const { records, position } = yield* space.read(collection, after);
            const read = records.map(readers[collection]!);
            yield* warn(name, read);
            shown.show(collection, read);
            positions.set(collection, position);
          }),
        { discard: true },
      ),
    );

    // 1. Load
    yield* refresh;

    // 3. Keep
    const write = (written: ReadonlyArray<Written>) =>
      Effect.andThen(space.write(written), refresh);

    const keep: Opened['keep'] = (collection, entities, cursor) =>
      Effect.gen(function* () {
        const read = entities.map(readers[collection]!);
        yield* warn(name, read);
        // Neither the records nor the cursor move past an Entity this app
        // cannot read: newer code reads it again after a reload.
        if (read.some((each) => each._tag === 'Outdated')) return 'outdated';
        const records = read.flatMap((each) =>
          each._tag === 'Read' ? [{ id: each.id, entity: each.entity }] : [],
        );
        yield* write([{ collection, records, ...(cursor ? { cursor } : {}) }]);
        return 'kept';
      });

    const confirm: Live['confirm'] = (entities) =>
      Effect.gen(function* () {
        if (yield* Deferred.isDone(stopped))
          return yield* new ReplicaError({
            message: `Instance ${name} has stopped, so it cannot confirm what the Backend returned`,
          });
        const parts = new Map<string, Written['records'][number][]>();
        for (const entity of entities) {
          const collection = byEntity.get(entity.meta._e);
          if (collection === undefined)
            return yield* new ReplicaError({
              message: `Instance ${name} has no Collection of "${entity.meta._e}"`,
            });
          const read = readers[collection]!(entity);
          if (read._tag !== 'Read')
            return yield* new ReplicaError({
              message:
                read._tag === 'Outdated'
                  ? `The Backend returned "${entity.meta._e}" at version ${read.version}, newer than this app knows`
                  : `The Backend returned a "${entity.meta._e}" that does not match its ESchema: ${read.message}`,
            });
          parts.set(collection, [
            ...(parts.get(collection) ?? []),
            { id: read.id, entity },
          ]);
        }
        yield* write(
          [...parts].map(([collection, records]) => ({ collection, records })),
        );
      });

    const track: Live['track'] = (action) =>
      Effect.acquireRelease(
        Queue.offer(messages, { _tag: 'ActionBegan', action }),
        () => Queue.offer(messages, { _tag: 'ActionEnded', action }),
      ).pipe(Effect.asVoid);

    return {
      live: {
        name,
        key,
        collections: shown.collections,
        confirm,
        stopped: Deferred.await(stopped),
        track,
      },
      space,
      refresh,
      keep,
      messages: Stream.fromQueue(messages),
    };
  });
