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

type Note = { id: string; title: string };

const NoteSchema = EntityESchema.make('Note', 'id', {
  title: Schema.String,
}).build();

const note = (
  id: string,
  title: string,
  updated: string,
): DecodedEntity<Note> => ({
  value: { id, title },
  meta: { _e: 'Note', _d: false, _u: updated },
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
    platform: {
      ...(options.storeLayer ? { storeLayer: options.storeLayer } : {}),
      ...(options.peerSync ? { peerSync: options.peerSync } : {}),
    },
  });
  const config = app.sync({ schema: NoteSchema });
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

const received = (writes: readonly unknown[], entity: DecodedEntity<Note>) =>
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
    'Peer sync is a speed path between open tabs. It is never a source of truth.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Do two tabs with in-memory copies agree at once?', {
      answer:
        'Yes. Each tab has its own copy of the data. One tab accepts a confirmed note. Peer sync carries that note to the other tab, which then agrees and updates its screen.',
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
        const entity = note('memory', 'Memory peers', '1');
        yield* eventually(() => bus.subscribers('memory-tabs.note') === 2);
        yield* left.config.utils.applyToSyncReplica(entity);
        const converged = yield* eventually(() =>
          received(right.projection.writes, entity),
        );
        yield* Story.assert('the Memory-backed peer converged', converged);
        yield* close(left, right);
      }),
    }),
    Story.question(
      'What changes when a tab reads the backend and peer sync is off?',
      {
        answer:
          'Correctness does not change. Speed changes. Peer sync delivers a confirmed note at once. A tab without it stays behind until its next read of the backend applies the same note.',
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
          const entity = note('freshness', 'Compare delivery', '2');
          yield* eventually(() => bus.subscribers('fast-path.note') === 2);
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
      },
    ),
    Story.question('What repairs a peer message that was lost?', {
      answer:
        'Reading the backend repairs it. Peer sync may lose a message without failing the work that started it. A later read or push from the backend applies the confirmed note through the same path.',
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
        const entity = note('repair', 'Backend repairs', '3');
        yield* eventually(() => bus.subscribers('repair.note') === 2);
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
    Story.question('Are durable storage and peer freshness connected?', {
      answer:
        'No. An in-memory copy can be current through peer sync and still not survive a reload. An IndexedDB copy can survive a reload with peer sync off. The two are independent.',
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
        const entity = note('durable', 'Survives reload', '4');
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
    Story.question('Does turning peer sync off lose agreement?', {
      answer:
        'No. It removes the short path only. A later delivery from the backend still makes each tab agree, through its own copy and its own screen.',
      proof: Effect.gen(function* () {
        const left = openTab({ name: 'disabled', peerSync: false });
        const right = openTab({ name: 'disabled', peerSync: false });
        const entity = note('disabled', 'Backend only', '5');
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
