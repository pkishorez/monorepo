import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Duration, Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { type DecodedEntity } from 'std-toolkit/core';
import { IDB } from 'std-toolkit/db/idb';
import { Memory } from 'std-toolkit/db/memory';
import { EntityESchema } from 'std-toolkit/eschema';
import {
  createStdSync,
  syncStore,
  type PeerChannelFactory,
  type SyncStoreLayer,
} from 'std-toolkit/sync';

type Todo = { id: string; title: string };

const TodoSchema = EntityESchema.make('Todo', 'id', {
  title: Schema.String,
}).build();

const todo = (
  id: string,
  title: string,
  updated: string,
): DecodedEntity<Todo> => ({
  value: { id, title },
  meta: { _e: 'Todo', _d: false, _u: updated },
});

const makeBus = () => {
  const subscriptions = new Map<string, Set<(message: unknown) => void>>();
  let drop = false;

  const factory: PeerChannelFactory = (name) => {
    let own: ((message: unknown) => void) | null = null;
    return {
      broadcast: async (message) => {
        if (drop) return;
        for (const handler of subscriptions.get(name) ?? []) {
          if (handler !== own) handler(message);
        }
      },
      subscribe: async (handler) => {
        own = handler;
        const handlers = subscriptions.get(name) ?? new Set();
        handlers.add(handler);
        subscriptions.set(name, handlers);
        return async () => {
          handlers.delete(handler);
        };
      },
    };
  };

  return {
    factory,
    setDrop: (value: boolean) => {
      drop = value;
    },
    subscribers: (name: string) => subscriptions.get(name)?.size ?? 0,
  };
};

const makeProjection = () => {
  const writes: unknown[] = [];
  return {
    callbacks: {
      begin: () => undefined,
      write: (operation: unknown) => writes.push(operation),
      commit: () => undefined,
      truncate: () => undefined,
      markReady: () => undefined,
      collection: {
        update: () => undefined,
        on: () => () => undefined,
        status: 'ready',
        size: 0,
        subscriberCount: 0,
      },
    },
    writes,
  };
};

const openTab = (options: {
  name: string;
  storeLayer?: SyncStoreLayer;
  peerSync?: false | { channel: PeerChannelFactory };
}) => {
  const app = createStdSync({
    name: options.name,
    ...(options.storeLayer ? { storeLayer: options.storeLayer } : {}),
    ...(options.peerSync === undefined ? {} : { peerSync: options.peerSync }),
  });
  const config = app.sync({ schema: TodoSchema });
  const projection = makeProjection();
  const subscription = config.sync.sync(projection.callbacks as never) as {
    cleanup: () => Promise<void>;
  };
  return { app, config, projection, subscription };
};

const eventually = (predicate: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (predicate()) return true;
      yield* Effect.sleep(Duration.millis(5));
    }
    return false;
  });

const received = (writes: readonly unknown[], entity: DecodedEntity<Todo>) =>
  writes.some(
    (write) =>
      typeof write === 'object' &&
      write !== null &&
      'type' in write &&
      write.type === 'update' &&
      'value' in write &&
      typeof write.value === 'object' &&
      write.value !== null &&
      'id' in write.value &&
      write.value.id === entity.value.id,
  );

const close = (
  ...tabs: readonly ReturnType<typeof openTab>[]
): Effect.Effect<void> =>
  Effect.promise(async () => {
    await Promise.allSettled(
      tabs.flatMap((tab) => [tab.subscription.cleanup(), tab.app.dispose()]),
    );
  });

export const peerSyncModel = Story.make({
  title: 'Peer Sync is a freshness path',
  description:
    'Peer sync is a freshness path between live tabs, never a source of truth.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Do two Memory-backed tabs converge immediately?', {
      answer:
        'Yes. Each tab owns a separate in-memory Sync Replica. After one tab accepts a Backend-confirmed Entity, Peer Sync carries that Entity to the other tab, which converges and advances its own Collection Projection.',
      proof: Effect.gen(function* () {
        const bus = makeBus();
        const left = openTab({
          name: 'memory-tabs',
          storeLayer: Memory.make(syncStore).layer,
          peerSync: { channel: bus.factory },
        });
        const right = openTab({
          name: 'memory-tabs',
          storeLayer: Memory.make(syncStore).layer,
          peerSync: { channel: bus.factory },
        });
        const entity = todo('memory', 'Memory peers', '1');
        yield* eventually(() => bus.subscribers('memory-tabs.todo') === 2);
        yield* left.config.utils.applyToSyncReplica(entity);
        const converged = yield* eventually(() =>
          received(right.projection.writes, entity),
        );
        yield* Story.assert('the Memory-backed peer converged', converged);
        yield* close(left, right);
      }),
    }),
    Story.question('What changes when polling runs without Peer Sync?', {
      answer:
        'Correctness does not change, but freshness does. Peer Sync delivers an accepted Entity immediately; polling-only tabs remain stale until the next bounded backend poll applies the same Entity.',
      proof: Effect.gen(function* () {
        const bus = makeBus();
        const peerLeft = openTab({
          name: 'fast-path',
          peerSync: { channel: bus.factory },
        });
        const peerRight = openTab({
          name: 'fast-path',
          peerSync: { channel: bus.factory },
        });
        const pollLeft = openTab({ name: 'polling-only', peerSync: false });
        const pollRight = openTab({ name: 'polling-only', peerSync: false });
        const entity = todo('freshness', 'Compare delivery', '2');
        yield* eventually(() => bus.subscribers('fast-path.todo') === 2);
        yield* peerLeft.config.utils.applyToSyncReplica(entity);
        yield* pollLeft.config.utils.applyToSyncReplica(entity);
        const peerWasImmediate = yield* eventually(() =>
          received(peerRight.projection.writes, entity),
        );
        yield* Story.assert(
          'Peer Sync used the immediate path',
          peerWasImmediate,
        );
        yield* Story.assert(
          'polling-only remained stale before its poll',
          !received(pollRight.projection.writes, entity),
        );
        yield* Effect.sleep(Duration.millis(25));
        yield* pollRight.config.utils.applyToSyncReplica(entity);
        yield* Story.assert(
          'the bounded backend poll converged',
          received(pollRight.projection.writes, entity),
        );
        yield* close(peerLeft, peerRight, pollLeft, pollRight);
      }),
    }),
    Story.question('What repairs a missed peer message?', {
      answer:
        'Backend sync does. Peer Sync may drop a message without failing the originating work; a later backend poll or push applies the confirmed Entity through the same convergence path.',
      proof: Effect.gen(function* () {
        const bus = makeBus();
        const left = openTab({
          name: 'repair',
          peerSync: { channel: bus.factory },
        });
        const right = openTab({
          name: 'repair',
          peerSync: { channel: bus.factory },
        });
        const entity = todo('repair', 'Backend repairs', '3');
        yield* eventually(() => bus.subscribers('repair.todo') === 2);
        bus.setDrop(true);
        yield* left.config.utils.applyToSyncReplica(entity);
        yield* Story.assert(
          'the dropped peer message left the receiver stale',
          !received(right.projection.writes, entity),
        );
        yield* right.config.utils.applyToSyncReplica(entity);
        yield* Story.assert(
          'backend delivery repaired the miss',
          received(right.projection.writes, entity),
        );
        yield* close(left, right);
      }),
    }),
    Story.question('Are IndexedDB durability and peer freshness coupled?', {
      answer:
        'No. Memory replicas can be fresh through Peer Sync without surviving reload, while an IndexedDB replica can survive reload with Peer Sync disabled. Durability and live-tab freshness are independent choices.',
      proof: Effect.gen(function* () {
        const indexedDB = new IDBFactory();
        const database = IDB.database({
          databaseName: `sync-story-${crypto.randomUUID()}`,
          indexedDB,
        });
        const firstAdapter = IDB.make(syncStore, { database });
        yield* firstAdapter.setup;
        const beforeReload = openTab({
          name: 'durable',
          storeLayer: firstAdapter.layer,
          peerSync: false,
        });
        const entity = todo('durable', 'Survives reload', '4');
        yield* beforeReload.config.utils.applyToSyncReplica(entity);
        yield* close(beforeReload);

        const secondAdapter = IDB.make(syncStore, { database });
        yield* secondAdapter.setup;
        const afterReload = openTab({
          name: 'durable',
          storeLayer: secondAdapter.layer,
          peerSync: false,
        });
        const hydrated = yield* eventually(() =>
          received(afterReload.projection.writes, entity),
        );
        yield* Story.assert(
          'IndexedDB hydrated after reload without Peer Sync',
          hydrated,
        );
        yield* close(afterReload);
      }),
    }),
    Story.question('Does disabling Peer Sync sacrifice convergence?', {
      answer:
        'No. It removes only the same-origin shortcut. A later backend delivery still makes each tab converge through its own Sync Replica and Collection Projection.',
      proof: Effect.gen(function* () {
        const left = openTab({ name: 'disabled', peerSync: false });
        const right = openTab({ name: 'disabled', peerSync: false });
        const entity = todo('disabled', 'Backend only', '5');
        yield* left.config.utils.applyToSyncReplica(entity);
        yield* Story.assert(
          'the disabled peer stayed stale before backend delivery',
          !received(right.projection.writes, entity),
        );
        yield* right.config.utils.applyToSyncReplica(entity);
        yield* Story.assert(
          'backend delivery preserved eventual convergence',
          received(right.projection.writes, entity),
        );
        yield* close(left, right);
      }),
    }),
  ],
});
