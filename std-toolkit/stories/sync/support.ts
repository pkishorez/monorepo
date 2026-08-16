import {
  Activation,
  initFlow,
  type ActivationRef,
} from '@pkishorez/effect-tracer/flow';
import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import {
  createLiveQueryCollection,
  createOptimisticAction,
  type Collection,
  type GetResult,
  type InitialQueryBuilder,
  type PendingMutation,
  type QueryBuilder,
  type Transaction,
} from '@tanstack/react-db';
import { Cause, Duration, Effect, Queue, Schema, Stream } from 'effect';
import { Story, StoryContext } from 'laymos/story';
import { nextUlid, type EntityType } from 'std-toolkit/core';
import { StdTable, type KeyedEntityDefinition } from 'std-toolkit/db';
import { Memory } from 'std-toolkit/db/memory';
import { EntityESchema, type AnyEntityESchema } from 'std-toolkit/eschema';
import {
  createStdSync,
  syncPersistenceTable,
  type ChangeNoticeChannel,
  type ChannelFactory,
  type EffectRuntime,
  type SyncPersistenceLayer,
  type SyncConfig,
} from 'std-toolkit/sync';

// Public simulation DSL

/**
 * Story vocabulary:
 *
 * - `backend.insert/update/remove('CollectionName', ...)`
 * - `browser('alice').insert/update/remove('CollectionName', ...)`
 * - `browser('alice').mount({ name, query })` and `.unmount(liveQuery)`
 * - `browser('alice').tab('second')` for another tab on the same storage
 * - `browser('alice').transact(label, ({ collection }) => ...)`
 * - `backend.holdNextWrite` for deterministic optimistic success or failure
 * - `browser('alice').disconnect` and `.reconnect`
 * - `liveQuery.shows(rows)` and `.eventuallyShows(rows)`
 */
export const Simulation = {
  collection<const E extends AnyEntity>(
    definition: CollectionDefinition<E>,
  ): CollectionDefinition<E> {
    return definition;
  },

  make<const D extends readonly AnyDefinition[]>(config: SimulationConfig<D>) {
    return {
      run<A, E>(script: SimulationScript<D, A, E>) {
        return runSimulation(config, script);
      },
    };
  },
};

// Type-safe collection registry

type AnyEntity = KeyedEntityDefinition<
  string,
  AnyEntityESchema,
  readonly string[],
  readonly string[],
  any
> & {
  insert(value: any): Effect.Effect<EntityType<any>, unknown, any>;
  getAndUpdate(
    key: any,
    changes: any,
  ): Effect.Effect<EntityType<any>, unknown, any>;
  delete(key: any): Effect.Effect<EntityType<any>, unknown, any>;
  query(
    ...args: any[]
  ): Effect.Effect<
    { readonly items: readonly EntityType<any>[]; readonly hasMore: boolean },
    unknown,
    any
  >;
  insertOp(value: any): Effect.Effect<any, unknown, any>;
  getAndUpdateOp(key: any, changes: any): Effect.Effect<any, unknown, any>;
  deleteOp(key: any): Effect.Effect<any, unknown, any>;
};

type ItemOf<E extends AnyEntity> = E['schema']['Type'];
type NameOf<E extends AnyEntity> = E['name'];
type KeyOf<E extends AnyEntity> = Parameters<E['delete']>[0];
type InsertOf<E extends AnyEntity> = Parameters<E['insert']>[0];
type DefinitionName<D extends AnyDefinition> = NameOf<D['entity']>;
type Names<D extends readonly AnyDefinition[]> = DefinitionName<D[number]>;
type DefinitionAt<
  D extends readonly AnyDefinition[],
  N extends Names<D>,
> = Extract<D[number], { readonly entity: { readonly name: N } }>;
type EntityAt<
  D extends readonly AnyDefinition[],
  N extends Names<D>,
> = DefinitionAt<D, N>['entity'];

type EffectValue<T> = T extends Effect.Effect<infer A, any, any> ? A : never;
type EffectError<T> = T extends Effect.Effect<any, infer E, any> ? E : never;
type CollectionSubscription = ReturnType<
  Collection<any, any, any>['subscribeChanges']
>;

export type BackendEntity<E extends AnyEntity> = {
  readonly name: NameOf<E>;
  insert(value: InsertOf<E>): Effect.Effect<EntityType<ItemOf<E>>, unknown>;
  update(
    key: KeyOf<E>,
    changes: Partial<ItemOf<E>>,
  ): Effect.Effect<EntityType<ItemOf<E>>, unknown>;
  remove(key: KeyOf<E>): Effect.Effect<EntityType<ItemOf<E>>, unknown>;
  query(
    ...args: Parameters<E['query']>
  ): Effect.Effect<
    EffectValue<ReturnType<E['query']>>,
    EffectError<ReturnType<E['query']>>
  >;
  changes(options: {
    readonly cursor: EntityType<ItemOf<E>> | null;
    readonly catchUp: (
      cursor: EntityType<ItemOf<E>> | null,
    ) => Effect.Effect<readonly EntityType<ItemOf<E>>[], unknown>;
    readonly includes?: (entity: EntityType<ItemOf<E>>) => boolean;
  }): Stream.Stream<EntityType<ItemOf<E>>[], unknown>;
};

export type CollectionDefinition<E extends AnyEntity> = {
  readonly entity: E;
  readonly configure: (context: { readonly backend: BackendEntity<E> }) => Omit<
    SyncConfig<E['schema']>,
    'schema' | 'onInsert' | 'onUpdate' | 'onDelete'
  > & {
    readonly onUpdate?: SyncConfig<E['schema']>['onUpdate'];
  };
};

type AnyDefinition = {
  readonly entity: AnyEntity;
  readonly configure: (context: any) => any;
};

type BrowserCollection<E extends AnyEntity> = Collection<
  ItemOf<E> & Record<string, unknown>,
  string,
  any
>;

type ExpectedRow<T extends object> = Omit<
  T,
  '$synced' | '$origin' | '$key' | '$collectionId'
>;

type StoryLiveQuery<T extends object> = Collection<T, string | number, any> & {
  shows(
    expected: readonly ExpectedRow<T>[],
  ): Effect.Effect<void, unknown, StoryContext>;
  eventuallyShows(
    expected: readonly ExpectedRow<T>[],
  ): Effect.Effect<void, unknown, StoryContext>;
};

type QueryResult<Q extends QueryBuilder<any>> = Extract<
  GetResult<Q extends QueryBuilder<infer Context> ? Context : never>,
  object
>;

export type WriteGate = {
  readonly succeed: Effect.Effect<void>;
  fail(error: unknown): Effect.Effect<void>;
};

export type TransactionHandle = {
  readonly transaction: Transaction;
  readonly persisted: Effect.Effect<void, unknown>;
  readonly failed: Effect.Effect<void, unknown>;
};

type SimulationConfig<D extends readonly AnyDefinition[]> = {
  readonly table: StdTable;
  readonly collections: D;
};

type Tab<D extends readonly AnyDefinition[]> = ReturnType<
  typeof makeBrowser<D>
>;

type BrowserWithTabs<D extends readonly AnyDefinition[]> = Tab<D> & {
  tab(name: string): Tab<D>;
};

type Device<D extends readonly AnyDefinition[]> = {
  readonly connection: Connection;
  readonly persistenceLayer: SyncPersistenceLayer;
  readonly noticeChannel: ChannelFactory;
  readonly tabs: Map<string, Tab<D>>;
};

const MAIN_TAB = 'main';

// Stands in for BroadcastChannel: same name, delivered to every peer but the sender.
const makeChannelHub = (): ChannelFactory => {
  const named = new Map<string, Set<ChangeNoticeChannel>>();
  return (name) => {
    const peers = named.get(name) ?? new Set<ChangeNoticeChannel>();
    named.set(name, peers);
    const channel: ChangeNoticeChannel = {
      onmessage: null,
      postMessage: (data) => {
        for (const peer of peers) {
          if (peer !== channel) peer.onmessage?.({ data });
        }
      },
      close: () => peers.delete(channel),
    };
    peers.add(channel);
    return channel;
  };
};

type SimulationWorld<D extends readonly AnyDefinition[]> = {
  readonly backend: ReturnType<typeof makeBackend<D>>;
  browser(name: string): BrowserWithTabs<D>;
  concurrent<const Effects extends readonly Effect.Effect<any, any, any>[]>(
    ...effects: Effects
  ): Effect.Effect<
    { -readonly [K in keyof Effects]: EffectValue<Effects[K]> },
    EffectError<Effects[number]>,
    any
  >;
};

type SimulationScript<D extends readonly AnyDefinition[], A, E> = (
  world: SimulationWorld<D>,
) => Effect.Effect<A, E, StoryContext>;

// Small shared helpers

class BrowserDisconnected extends Error {
  readonly _tag = 'BrowserDisconnected';

  constructor(readonly browser: string) {
    super(`Browser "${browser}" is disconnected from the Backend`);
  }
}

const effectFromPromise = <A>(promise: Promise<A>) =>
  Effect.tryPromise({ try: () => promise, catch: (error) => error });

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value
      .map(canonical)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '_meta' && !key.startsWith('$'))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
};

const same = (left: unknown, right: unknown) =>
  JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

const withoutRuntimeFields = <A extends object>(value: A): A =>
  canonical(value) as A;

const eventually = <A extends object>(
  collection: Collection<A, any, any>,
  expected: readonly unknown[],
  timeout = Duration.seconds(5),
) =>
  effectFromPromise(
    new Promise<boolean>((resolve) => {
      const matches = () => same(collection.toArray, expected);
      if (matches()) {
        resolve(true);
        return;
      }
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        subscription.unsubscribe();
        resolve(result);
      };
      const subscription = collection.subscribeChanges(() => {
        if (matches()) finish(true);
      });
      const timer = setTimeout(() => finish(false), Duration.toMillis(timeout));
    }),
  );

const keyFrom = <E extends AnyEntity>(entity: E, value: ItemOf<E>): KeyOf<E> =>
  Object.fromEntries(
    [...entity.primary.pk, entity.schema.idField].map((field) => [
      field,
      value[field as keyof ItemOf<E>],
    ]),
  ) as KeyOf<E>;

const assertKeyFieldsUnchanged = <E extends AnyEntity>(
  entity: E,
  original: ItemOf<E>,
  modified: ItemOf<E>,
) => {
  for (const field of entity.primary.pk) {
    if (
      original[field as keyof ItemOf<E>] !== modified[field as keyof ItemOf<E>]
    ) {
      throw new Error(
        `Cannot change Entity key field "${field}" on ${entity.name}; delete and insert instead`,
      );
    }
  }
};

// Backend

type Connection = {
  readonly browser: string;
  online: boolean;
  readonly disconnectListeners: Set<() => void>;
};

const makeBackend = <const D extends readonly AnyDefinition[]>(options: {
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
  const listeners = new Map<string, Set<(entity: EntityType<any>) => void>>();
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

  const announce = (name: string, entity: EntityType<any>) =>
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
      ) as Effect.Effect<EntityType<ItemOf<E>>, unknown>,
    update: (key, changes) =>
      write(
        entity.name,
        'Update',
        on(entity.getAndUpdate(key, changes)),
        connection,
      ).pipe(
        Effect.tap((result) => announce(entity.name, result)),
      ) as Effect.Effect<EntityType<ItemOf<E>>, unknown>,
    remove: (key) =>
      write(entity.name, 'Remove', on(entity.delete(key)), connection).pipe(
        Effect.tap((result) => announce(entity.name, result)),
      ) as Effect.Effect<EntityType<ItemOf<E>>, unknown>,
    query: (...args) =>
      checkConnection(connection).pipe(
        Effect.andThen(on(entity.query(...args))),
      ) as never,
    changes: ({ cursor, catchUp, includes = () => true }) =>
      Stream.callback<EntityType<ItemOf<E>>[], unknown>((queue) =>
        Effect.gen(function* () {
          yield* checkConnection(connection);
          const entityListeners =
            listeners.get(entity.name) ??
            new Set<(value: EntityType<any>) => void>();
          listeners.set(entity.name, entityListeners);
          const listener = (changed: EntityType<ItemOf<E>>) => {
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
            confirmed as readonly EntityType<any>[],
            (entity) => announce(entity.meta._e, entity),
            { discard: true },
          );
          return confirmed as readonly EntityType<any>[];
        }),
        connection,
      ),
  };

  return api;
};

// Browser

const makeBrowser = <const D extends readonly AnyDefinition[]>(options: {
  readonly name: string;
  readonly label: string;
  readonly definitions: D;
  readonly backend: ReturnType<typeof makeBackend<D>>;
  readonly flowId: string;
  readonly runtime: EffectRuntime<never>;
  readonly disposeLiveQueries: Set<() => Promise<void>>;
  readonly connection: Connection;
  readonly persistenceLayer: SyncPersistenceLayer;
  readonly noticeChannel: ChannelFactory;
}) => {
  const connection = options.connection;
  const prefix = `browser:${options.label}`;
  const lane = initFlow({ id: options.flowId, participantName: prefix });
  const app = createStdSync<never>({
    name: options.name,
    runtime: options.runtime,
    flow: { id: options.flowId, participantPrefix: prefix },
    persistenceLayer: options.persistenceLayer,
    notices: { scope: options.name, channel: options.noticeChannel },
    // TanStack DB arms a single shared, ref'd GC timer for the longest gcTime in
    // play, so the default five minutes would hold the story process open long
    // after the last Story finished.
    options: { gcTime: 1 },
  });
  const collections = new Map<string, Collection<any, string, any>>();
  const collectionDefinitions = new Map<object, AnyDefinition>();
  const mounts = new WeakMap<
    object,
    { subscription: CollectionSubscription; activation: ActivationRef }
  >();
  // One stable lane per named Live Query; each mount is one Activation on it.
  const queryLanes = new Map<string, ReturnType<typeof initFlow>>();
  const queryLane = (name: string) => {
    const existing = queryLanes.get(name);
    if (existing) return existing;
    const created = initFlow({
      id: options.flowId,
      participantName: `query:${options.label}/${name}`,
    });
    queryLanes.set(name, created);
    return created;
  };

  for (const selected of options.definitions) {
    const entity = selected.entity;
    const backend = options.backend.entity(entity.name, connection);
    const configured = selected.configure({ backend } as never);
    const collection = app.collection({
      ...configured,
      schema: entity.schema,
      onInsert: (value: any) => backend.insert(value),
      onUpdate:
        configured.onUpdate ??
        (({ current, updates }: { current: any; updates: any }) =>
          backend.update(keyFrom(entity, current), updates)),
      onDelete: ({ current }: { current: any }) =>
        backend.remove(keyFrom(entity, current)),
    } as never);
    collections.set(entity.name, collection);
    collectionDefinitions.set(collection, selected);
  }

  const getCollection = <N extends Names<D>>(name: N) => {
    const found = collections.get(name);
    if (!found) throw new Error(`Unknown Collection "${name}"`);
    return found as BrowserCollection<EntityAt<D, N>>;
  };

  const runDirect = <A extends object>(
    name: string,
    operation: string,
    make: () => Transaction<A>,
  ) =>
    lane.withSpan(`${operation} ${name}`)(
      Effect.gen(function* () {
        const participant = `${prefix}/collection:${name}`;
        yield* lane.send(participant, operation);
        const transaction = yield* Effect.sync(make);
        yield* effectFromPromise(transaction.isPersisted.promise);
      }),
    );

  const browser = {
    name: options.name,
    label: options.label,
    app,
    collection: getCollection,
    insert<N extends Names<D>>(name: N, value: InsertOf<EntityAt<D, N>>) {
      return runDirect(name, 'Insert', () => getCollection(name).insert(value));
    },
    update<N extends Names<D>>(
      name: N,
      key: KeyOf<EntityAt<D, N>>,
      changes: Partial<ItemOf<EntityAt<D, N>>>,
    ) {
      const entity = options.backend.entity(name).name;
      const selected = options.definitions.find(
        (definition) => definition.entity.name === entity,
      )!;
      const id = String(
        key[selected.entity.schema.idField as keyof typeof key],
      );
      return runDirect(name, 'Update', () =>
        getCollection(name).update(id, (draft) =>
          Object.assign(draft, changes),
        ),
      );
    },
    remove<N extends Names<D>>(name: N, key: KeyOf<EntityAt<D, N>>) {
      const selected = options.definitions.find(
        (definition) => definition.entity.name === name,
      )!;
      const id = String(
        key[selected.entity.schema.idField as keyof typeof key],
      );
      return runDirect(name, 'Remove', () => getCollection(name).delete(id));
    },
    mount<Q extends QueryBuilder<any>>(mount: {
      readonly name: string;
      readonly query: (query: InitialQueryBuilder) => Q;
    }): Effect.Effect<StoryLiveQuery<QueryResult<Q>>, unknown, StoryContext> {
      const query = queryLane(mount.name);
      return lane.withSpan(`Mount ${mount.name}`)(
        Effect.gen(function* () {
          yield* lane.send(query.participantName, 'Mount live query');
          const activation = yield* query.activation.start('Mounted');
          const liveQuery = createLiveQueryCollection({
            id: `${options.label}/${mount.name}`,
            query: mount.query as never,
            startSync: true,
            gcTime: 1,
          }) as StoryLiveQuery<QueryResult<Q>>;
          const subscription = liveQuery.subscribeChanges(() => undefined);
          mounts.set(liveQuery, { activation, subscription });
          Object.assign(liveQuery, {
            shows: (expected: readonly ExpectedRow<QueryResult<Q>>[]) =>
              Story.assert(
                `${mount.name} shows the expected rows`,
                same(liveQuery.toArray, expected),
              ),
            eventuallyShows: (
              expected: readonly ExpectedRow<QueryResult<Q>>[],
            ) =>
              Effect.gen(function* () {
                const matched = yield* eventually(liveQuery, expected);
                yield* Story.assert(
                  `${mount.name} eventually shows the expected rows`,
                  matched,
                );
              }),
          });
          options.disposeLiveQueries.add(() => liveQuery.cleanup());
          return liveQuery;
        }),
      );
    },
    unmount(liveQuery: StoryLiveQuery<any>): Effect.Effect<void, unknown> {
      return lane.withSpan('Unmount live query')(
        Effect.gen(function* () {
          const mounted = mounts.get(liveQuery);
          if (!mounted) throw new Error('Live Query is not mounted');
          mounts.delete(liveQuery);
          mounted.subscription.unsubscribe();
          yield* effectFromPromise(
            new Promise<void>((resolve, reject) => {
              if (liveQuery.status === 'cleaned-up') {
                resolve();
                return;
              }
              const timeout = setTimeout(() => {
                unsubscribe();
                reject(new Error('Live Query did not clean up after unmount'));
              }, 2_000);
              const unsubscribe = liveQuery.on('status:change', (event) => {
                if (event.status !== 'cleaned-up') return;
                clearTimeout(timeout);
                unsubscribe();
                resolve();
              });
            }),
          );
          yield* mounted.activation.end(Activation.completed());
        }),
      );
    },
    transact(
      label: string,
      mutate: (context: {
        collection<N extends Names<D>>(
          name: N,
        ): BrowserCollection<EntityAt<D, N>>;
      }) => void,
    ): Effect.Effect<TransactionHandle, unknown> {
      return lane.withSpan(label)(
        Effect.sync(() => {
          const optimistic = createOptimisticAction<void>({
            onMutate: () => mutate({ collection: getCollection }),
            mutationFn: async (_variables, { transaction }) => {
              const confirmed = await options.runtime.runPromise(
                options.backend.transact(
                  connection,
                  transaction,
                  collectionDefinitions,
                ),
              );
              const grouped = new Map<
                Collection<any, string, any>,
                EntityType<any>[]
              >();
              for (const entity of confirmed) {
                const collection = collections.get(entity.meta._e)!;
                const batch = grouped.get(collection) ?? [];
                batch.push(entity);
                grouped.set(collection, batch);
              }
              await Promise.all(
                [...grouped].map(([collection, entities]) =>
                  options.runtime.runPromise(
                    collection.utils.writeUpsert(entities),
                  ),
                ),
              );
            },
          });
          const transaction = optimistic(undefined);
          return {
            transaction,
            persisted: effectFromPromise(transaction.isPersisted.promise).pipe(
              Effect.asVoid,
            ),
            failed: Effect.flip(
              effectFromPromise(transaction.isPersisted.promise),
            ).pipe(Effect.asVoid),
          };
        }),
      );
    },
    disconnect: lane.withSpan('Disconnect')(
      Effect.sync(() => {
        if (!connection.online) return;
        connection.online = false;
        for (const listener of connection.disconnectListeners) listener();
      }),
    ),
    reconnect: lane.withSpan('Reconnect')(
      Effect.sync(() => {
        connection.online = true;
      }),
    ),
  };

  return browser;
};

// Simulation lifecycle

const runSimulation = <const D extends readonly AnyDefinition[], A, E>(
  config: SimulationConfig<D>,
  script: SimulationScript<D, A, E>,
): Effect.Effect<A, unknown, StoryContext> =>
  Effect.gen(function* () {
    const context = yield* StoryContext;
    const recorder = makeTraceRecorder();
    const runtime = {
      runSync: <X, XE>(effect: Effect.Effect<X, XE, never>) =>
        Effect.runSync(recorder.instrument(effect)),
      runPromise: <X, XE>(effect: Effect.Effect<X, XE, never>) =>
        Effect.runPromise(recorder.instrument(effect)),
    } satisfies EffectRuntime<never>;
    const flowId = `sync-story::${runtime.runSync(nextUlid)}`;
    const memory = Memory.make(config.table as never);
    const liveQueries = new Set<() => Promise<void>>();
    const collectionNames = new Set<string>();
    for (const selected of config.collections) {
      if (selected.entity.table.logicalName !== config.table.logicalName) {
        throw new Error(
          `Collection "${selected.entity.name}" does not belong to Backend table "${config.table.logicalName}"`,
        );
      }
      if (collectionNames.has(selected.entity.name)) {
        throw new Error(
          `Collection "${selected.entity.name}" is defined more than once`,
        );
      }
      collectionNames.add(selected.entity.name);
    }
    const backend = makeBackend({
      definitions: config.collections,
      table: config.table,
      layer: memory.layer,
      flowId,
    });
    const devices = new Map<string, Device<D>>();
    const openDevice = (name: string): Device<D> => {
      const existing = devices.get(name);
      if (existing) return existing;
      const created: Device<D> = {
        connection: {
          browser: name,
          online: true,
          disconnectListeners: new Set(),
        },
        persistenceLayer: Memory.make(syncPersistenceTable).layer,
        noticeChannel: makeChannelHub(),
        tabs: new Map(),
      };
      devices.set(name, created);
      return created;
    };
    const openTab = (name: string, tabName: string): Tab<D> => {
      const device = openDevice(name);
      const existing = device.tabs.get(tabName);
      if (existing) return existing;
      const created = makeBrowser({
        name,
        label: tabName === MAIN_TAB ? name : `${name}#${tabName}`,
        definitions: config.collections,
        backend,
        flowId,
        runtime,
        disposeLiveQueries: liveQueries,
        connection: device.connection,
        persistenceLayer: device.persistenceLayer,
        noticeChannel: device.noticeChannel,
      });
      device.tabs.set(tabName, created);
      return created;
    };
    const world: SimulationWorld<D> = {
      backend,
      browser(name) {
        const main = openTab(name, MAIN_TAB);
        return Object.assign(main, {
          tab: (tabName: string) => openTab(name, tabName),
        });
      },
      concurrent: (...effects) =>
        Effect.all(effects, { concurrency: 'unbounded' }) as never,
    };

    return yield* recorder.instrument(script(world)).pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.allSettled([...liveQueries].map((dispose) => dispose())),
          );
          yield* Effect.promise(() =>
            Promise.allSettled(
              [...devices.values()].flatMap((device) =>
                [...device.tabs.values()].map((tab) => tab.app.dispose()),
              ),
            ),
          );
          for (const flow of recorder.snapshotFlows()) {
            yield* context.beginSection({ kind: 'flow', flow });
          }
        }),
      ),
    );
  });

// Todo fixture shared by the Sync stories

export const TodoSchema = EntityESchema.make('Todo', 'todoId', {
  listId: Schema.String,
  title: Schema.String,
  done: Schema.Boolean,
}).build();

export type Todo = typeof TodoSchema.Type;
export type TodoEntity = EntityType<Todo>;
export type TodoKey = { todoId: string; listId: string };

export const storyTable = StdTable.make('sync-stories')
  .primary('pk', 'sk')
  .build();

export const todoEntity = storyTable
  .entity(TodoSchema)
  .primary({ pk: ['listId'] })
  .build();

const byUpdateStamp = (left: TodoEntity, right: TodoEntity) =>
  left.meta._u < right.meta._u ? -1 : 1;

export const todoSource = (
  backend: BackendEntity<typeof todoEntity>,
  listId: string,
) => {
  const all = backend
    .query('primary', { pk: { listId }, '>=': null })
    .pipe(Effect.map((page) => [...page.items].sort(byUpdateStamp)));
  return {
    pageNewer: (cursor: TodoEntity | null, limit: number) =>
      all.pipe(
        Effect.map((entities) =>
          entities
            .filter(
              (entity) => cursor === null || entity.meta._u > cursor.meta._u,
            )
            .slice(0, limit),
        ),
      ),
    pageOlder: (cursor: TodoEntity | null, limit: number) =>
      all.pipe(
        Effect.map((entities) =>
          entities
            .filter(
              (entity) => cursor === null || entity.meta._u < cursor.meta._u,
            )
            .slice(-limit),
        ),
      ),
    changes: (cursor: TodoEntity | null) =>
      backend.changes({
        cursor,
        includes: (entity) => entity.value.listId === listId,
        catchUp: (from) =>
          all.pipe(
            Effect.map((entities) =>
              entities.filter(
                (entity) => from === null || entity.meta._u > from.meta._u,
              ),
            ),
          ),
      }),
  };
};
