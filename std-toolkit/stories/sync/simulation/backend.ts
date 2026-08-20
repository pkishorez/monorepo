import { initFlow } from '@pkishorez/effect-tracer/flow';
import type { PendingMutation, Transaction } from '@tanstack/react-db';
import { Cause, Effect, Queue, Stream } from 'effect';
import type { DecodedEntity } from 'std-toolkit/core';
import type { StdTable } from 'std-toolkit/db';

import {
  assertKeyFieldsUnchanged,
  BrowserDisconnected,
  effectFromPromise,
  keyFrom,
  withoutRuntimeFields,
  type AnyDefinition,
  type AnyEntity,
  type BackendEntity,
  type Connection,
  type EntityAt,
  type InsertOf,
  type ItemOf,
  type KeyOf,
  type Names,
  type WriteGate,
} from './types.js';

export const makeBackend = <const D extends readonly AnyDefinition[]>(options: {
  readonly definitions: D;
  readonly table: StdTable;
  readonly layer: unknown;
  readonly flowId: string;
}) => {
  const definitions = new Map(
    options.definitions.map((definition) => [
      definition.entity.name,
      definition,
    ]),
  );
  const listeners = new Map<
    string,
    Set<(entity: DecodedEntity<any>) => void>
  >();
  let nextWriteGate:
    | {
        readonly promise: Promise<void>;
        readonly resolve: () => void;
        readonly reject: (error: unknown) => void;
      }
    | undefined;
  const lane = initFlow({ id: options.flowId, participantName: 'backend' });

  const on = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provide(options.layer as never)) as Effect.Effect<A, E>;

  const definition = (name: string) => {
    const found = definitions.get(name);
    if (!found) throw new Error(`Unknown Collection "${name}"`);
    return found;
  };

  const announce = (name: string, entity: DecodedEntity<any>) =>
    Effect.sync(() => {
      for (const listener of listeners.get(name) ?? []) listener(entity);
    });

  const waitForWriteGate = Effect.suspend(() => {
    const gate = nextWriteGate;
    nextWriteGate = undefined;
    return gate ? effectFromPromise(gate.promise) : Effect.void;
  });

  const checkConnection = (connection?: Connection) =>
    connection && !connection.online
      ? Effect.fail(new BrowserDisconnected(connection.browser))
      : Effect.void;

  const write = <A, E>(
    name: string,
    operation: string,
    effect: Effect.Effect<A, E>,
    connection?: Connection,
  ) =>
    lane.withSpan(`${operation} ${name}`)(
      Effect.gen(function* () {
        yield* checkConnection(connection);
        yield* waitForWriteGate;
        return yield* effect;
      }),
    );

  const scoped = <E extends AnyEntity>(
    entity: E,
    connection?: Connection,
  ): BackendEntity<E> => ({
    name: entity.name,
    insert: (value) =>
      write(entity.name, 'Insert', on(entity.insert(value)), connection).pipe(
        Effect.tap((result) => announce(entity.name, result)),
      ) as Effect.Effect<DecodedEntity<ItemOf<E>>, unknown>,
    update: (key, changes) =>
      write(
        entity.name,
        'Update',
        on(entity.getAndUpdate(key, changes)),
        connection,
      ).pipe(
        Effect.tap((result) => announce(entity.name, result)),
      ) as Effect.Effect<DecodedEntity<ItemOf<E>>, unknown>,
    remove: (key) =>
      write(entity.name, 'Remove', on(entity.delete(key)), connection).pipe(
        Effect.tap((result) => announce(entity.name, result)),
      ) as Effect.Effect<DecodedEntity<ItemOf<E>>, unknown>,
    query: (...args) =>
      checkConnection(connection).pipe(
        Effect.andThen(on(entity.query(...args))),
      ) as never,
    changes: ({ cursor, catchUp, includes = () => true }) =>
      Stream.callback<DecodedEntity<ItemOf<E>>[], unknown>((queue) =>
        Effect.gen(function* () {
          yield* checkConnection(connection);
          const entityListeners =
            listeners.get(entity.name) ??
            new Set<(value: DecodedEntity<any>) => void>();
          listeners.set(entity.name, entityListeners);
          const listener = (changed: DecodedEntity<ItemOf<E>>) => {
            if (includes(changed)) Queue.offerUnsafe(queue, [changed]);
          };
          const disconnect = () =>
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(new BrowserDisconnected(connection!.browser)),
            );
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              entityListeners.add(listener);
              connection?.disconnectListeners.add(disconnect);
            }),
            () =>
              Effect.sync(() => {
                entityListeners.delete(listener);
                connection?.disconnectListeners.delete(disconnect);
              }),
          );
          const missed = yield* catchUp(cursor);
          if (missed.length > 0) Queue.offerUnsafe(queue, [...missed]);
        }),
      ),
  });

  const api = {
    entity<N extends Names<D>>(name: N, connection?: Connection) {
      return scoped(definition(name).entity as EntityAt<D, N>, connection);
    },
    insert<N extends Names<D>>(name: N, value: InsertOf<EntityAt<D, N>>) {
      return api.entity(name).insert(value);
    },
    update<N extends Names<D>>(
      name: N,
      key: KeyOf<EntityAt<D, N>>,
      changes: Partial<ItemOf<EntityAt<D, N>>>,
    ) {
      return api.entity(name).update(key, changes);
    },
    remove<N extends Names<D>>(name: N, key: KeyOf<EntityAt<D, N>>) {
      return api.entity(name).remove(key);
    },
    holdNextWrite: Effect.sync((): WriteGate => {
      if (nextWriteGate) throw new Error('A Backend write is already held');
      const pending = Promise.withResolvers<void>();
      nextWriteGate = {
        promise: pending.promise,
        resolve: () => pending.resolve(),
        reject: (error) => pending.reject(error),
      };
      return {
        succeed: Effect.sync(() => pending.resolve()),
        fail: (error) => Effect.sync(() => pending.reject(error)),
      };
    }),
    transact: (
      connection: Connection,
      transaction: Transaction,
      collectionDefinitions: Map<object, AnyDefinition>,
    ) =>
      write(
        'transaction',
        'Commit',
        Effect.gen(function* () {
          const operations = yield* Effect.forEach(
            transaction.mutations as readonly PendingMutation[],
            (mutation) => {
              const selected = collectionDefinitions.get(mutation.collection);
              if (!selected) {
                return Effect.fail(
                  new Error('Transaction contains an unregistered Collection'),
                );
              }
              const entity = selected.entity;
              const original = withoutRuntimeFields(
                mutation.original as Record<string, unknown>,
              );
              const modified = withoutRuntimeFields(
                mutation.modified as Record<string, unknown>,
              );
              switch (mutation.type) {
                case 'insert':
                  return on(entity.insertOp(modified));
                case 'update':
                  assertKeyFieldsUnchanged(entity, original, modified);
                  return on(
                    entity.getAndUpdateOp(
                      keyFrom(entity, original),
                      withoutRuntimeFields(
                        mutation.changes as Record<string, unknown>,
                      ),
                    ),
                  );
                case 'delete':
                  return on(entity.deleteOp(keyFrom(entity, original)));
              }
            },
          );
          const confirmed = yield* on(
            options.table.transact(operations as never),
          );
          yield* Effect.forEach(
            confirmed as readonly DecodedEntity<any>[],
            (entity) => announce(entity.meta._e, entity),
            { discard: true },
          );
          return confirmed as readonly DecodedEntity<any>[];
        }),
        connection,
      ),
  };

  return api;
};
