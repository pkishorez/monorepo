import {
  Activation,
  initFlow,
  type ActivationRef,
} from '@pkishorez/effect-tracer/flow';
import {
  createLiveQueryCollection,
  createOptimisticAction,
  type Collection,
  type InitialQueryBuilder,
  type QueryBuilder,
  type Transaction,
} from '@tanstack/react-db';
import { Effect } from 'effect';
import { Story, type StoryContext } from 'laymos/story';
import type { DecodedEntity } from 'std-toolkit/core';
import type {
  EffectRuntime,
  LeadershipLayer,
  SyncStoreLayer,
} from 'std-toolkit/sync';
import { createStdSync } from 'std-toolkit/sync';
import { broadcastChannel } from 'std-toolkit/sync/platform/browser';

import type { SimulatedDocument } from '../simulated-browser.js';
import type { makeBackend } from './backend.js';
import {
  effectFromPromise,
  eventually,
  keyFrom,
  same,
  type AnyDefinition,
  type BrowserCollection,
  type CollectionSubscription,
  type Connection,
  type EntityAt,
  type ExpectedRow,
  type InsertOf,
  type ItemOf,
  type KeyOf,
  type Names,
  type QueryResult,
  type StoryLiveQuery,
  type TransactionHandle,
} from './types.js';

export const makeBrowser = <const D extends readonly AnyDefinition[]>(options: {
  readonly name: string;
  readonly syncName: string;
  readonly label: string;
  readonly definitions: D;
  readonly backend: ReturnType<typeof makeBackend<D>>;
  readonly flowId: string;
  readonly runtime: EffectRuntime<never>;
  readonly disposeLiveQueries: Set<() => Promise<void>>;
  readonly connection: Connection;
  readonly storeLayer: SyncStoreLayer;
  readonly leadershipLayer?: LeadershipLayer;
  readonly document?: SimulatedDocument;
  readonly onClose: () => void;
}) => {
  const connection = options.connection;
  const prefix = `browser:${options.label}`;
  const lane = initFlow({ id: options.flowId, participantName: prefix });
  const peerChannel = broadcastChannel();
  const app = createStdSync<never>({
    name: options.syncName,
    runtime: options.runtime,
    flow: { id: options.flowId, participantPrefix: prefix },
    platform: {
      storeLayer: options.storeLayer,
      ...(options.leadershipLayer
        ? { leadershipLayer: options.leadershipLayer }
        : {}),
      ...(peerChannel ? { peerSync: { channel: peerChannel } } : {}),
    },
    // TanStack DB arms a single shared, ref'd GC timer for the longest gcTime in
    // play, so the default five minutes would hold the story process open long
    // after the last Story finished.
    options: { gcTime: 1 },
  });
  const collections = new Map<string, Collection<any, string, any>>();
  const collectionDefinitions = new Map<object, AnyDefinition>();
  const mounts = new WeakMap<
    object,
    {
      subscription: CollectionSubscription;
      activation: ActivationRef;
      dispose: () => Promise<void>;
    }
  >();
  const ownLiveQueries = new Set<() => Promise<void>>();
  let closed = false;
  const assertOpen = () => {
    if (closed) throw new Error(`Tab "${options.label}" is closed`);
  };
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
      onInsert: (values: ReadonlyArray<any>) =>
        Effect.forEach(values, (value) => backend.insert(value)),
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
    assertOpen();
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
      assertOpen();
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
          const dispose = () => liveQuery.cleanup();
          mounts.set(liveQuery, { activation, subscription, dispose });
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
          ownLiveQueries.add(dispose);
          options.disposeLiveQueries.add(dispose);
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
          ownLiveQueries.delete(mounted.dispose);
          options.disposeLiveQueries.delete(mounted.dispose);
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
                DecodedEntity<any>[]
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
                    collection.utils.applyToSyncReplica(entities),
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
        assertOpen();
        if (!connection.online) return;
        connection.online = false;
        for (const listener of connection.disconnectListeners) listener();
      }),
    ),
    reconnect: lane.withSpan('Reconnect')(
      Effect.sync(() => {
        assertOpen();
        connection.online = true;
      }),
    ),
    hide: lane.withSpan('Hide tab')(
      Effect.sync(() => {
        assertOpen();
        if (!options.document) {
          throw new Error('Tab lifecycle requires Web Lock Leadership');
        }
        options.document.hide();
      }),
    ),
    show: lane.withSpan('Show tab')(
      Effect.sync(() => {
        assertOpen();
        if (!options.document) {
          throw new Error('Tab lifecycle requires Web Lock Leadership');
        }
        options.document.show();
      }),
    ),
    freeze: lane.withSpan('Freeze tab')(
      Effect.sync(() => {
        assertOpen();
        if (!options.document) {
          throw new Error('Tab lifecycle requires Web Lock Leadership');
        }
        options.document.freeze();
      }),
    ),
    resume: lane.withSpan('Resume tab')(
      Effect.sync(() => {
        assertOpen();
        if (!options.document) {
          throw new Error('Tab lifecycle requires Web Lock Leadership');
        }
        options.document.resume();
      }),
    ),
    close: lane.withSpan('Close tab')(
      Effect.gen(function* () {
        if (closed) return;
        closed = true;
        options.document?.close();
        const disposals = [...ownLiveQueries];
        ownLiveQueries.clear();
        for (const dispose of disposals)
          options.disposeLiveQueries.delete(dispose);
        yield* Effect.promise(() =>
          Promise.allSettled(disposals.map((dispose) => dispose())),
        );
        yield* Effect.promise(() => app.dispose());
        options.onClose();
      }),
    ),
  };

  return browser;
};
