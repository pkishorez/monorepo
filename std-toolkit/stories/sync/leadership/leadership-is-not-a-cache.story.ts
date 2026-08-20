import { IDBFactory } from 'fake-indexeddb';
import { Duration, Effect, Schema, Stream } from 'effect';
import { Story } from 'laymos/story';
import { type DecodedEntity } from 'std-toolkit/core';
import { IDB } from 'std-toolkit/db/idb';
import { Memory } from 'std-toolkit/db/memory';
import { EntityESchema } from 'std-toolkit/eschema';
import {
  createStdSync,
  syncStore,
  syncStrategy,
  type LeadershipLayer,
  type PeerChannelFactory,
  type SyncStoreLayer,
} from 'std-toolkit/sync';
import { inMemoryLeadership } from 'std-toolkit/sync/leadership/in-memory';

type Todo = { id: string; title: string };

const TodoSchema = EntityESchema.make('Todo', 'id', {
  title: Schema.String,
}).build();

const entity: DecodedEntity<Todo> = {
  value: { id: 't1', title: 'Already fetched' },
  meta: { _e: 'Todo', _d: false, _u: '1' },
};

const makeBus = () => {
  const subscriptions = new Map<string, Set<(message: unknown) => void>>();
  const factory: PeerChannelFactory = (name) => {
    let own: ((message: unknown) => void) | null = null;
    return {
      broadcast: async (message) => {
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

const received = (writes: readonly unknown[]) =>
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

const eventually = (predicate: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (predicate()) return true;
      yield* Effect.sleep(Duration.millis(5));
    }
    return false;
  });

const openTab = (options: {
  readonly name: string;
  readonly storeLayer: SyncStoreLayer;
  readonly leadershipLayer: LeadershipLayer;
  readonly peerSync: false | { readonly channel: PeerChannelFactory };
  readonly counters: { readers: number };
  readonly beforeRead?: Promise<void>;
}) => {
  const app = createStdSync({
    name: options.name,
    storeLayer: options.storeLayer,
    leadershipLayer: options.leadershipLayer,
    peerSync: options.peerSync,
  });
  const config = app.sync({
    schema: TodoSchema,
    sync: {
      total: {
        strategy: syncStrategy.oldToNew<Todo>({
          source: ({ live }) =>
            live({
              open: ({ cursor }) =>
                Stream.unwrap(
                  Effect.gen(function* () {
                    const beforeRead = options.beforeRead;
                    if (beforeRead) {
                      yield* Effect.promise(() => beforeRead);
                    }
                    options.counters.readers += 1;
                    return Stream.fromIterable(
                      cursor === null
                        ? [[entity] as DecodedEntity<Todo>[]]
                        : [],
                    );
                  }),
                ),
            }),
        }),
      },
    },
  });
  const projection = makeProjection();
  const subscription = config.sync.sync(projection.callbacks as never) as {
    cleanup: () => Promise<void>;
  };
  return { app, projection, subscription };
};

const close = (
  ...tabs: readonly ReturnType<typeof openTab>[]
): Effect.Effect<void> =>
  Effect.promise(async () => {
    await Promise.allSettled(
      tabs.flatMap((tab) => [tab.subscription.cleanup(), tab.app.dispose()]),
    );
  });

export const leadershipIsNotACache = Story.make({
  title: 'Leadership is not a cache',
  description:
    'Leadership stops a late tab repeating work; it does not hand that tab the results.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Can a late isolated Memory replica miss old data?', {
      answer:
        'Yes. Leadership prevents the late tab from repeating the backend reader, while its isolated Memory Sync Store starts empty. Peer Sync has no replay, so a message broadcast before that tab opened cannot hydrate it.',
      proof: Effect.gen(function* () {
        const bus = makeBus();
        const leadershipLayer = inMemoryLeadership();
        const counters = { readers: 0 };
        const leader = openTab({
          name: 'late-memory',
          storeLayer: Memory.make(syncStore).layer,
          leadershipLayer,
          peerSync: { channel: bus.factory },
          counters,
        });
        const leaderLoaded = yield* eventually(() =>
          received(leader.projection.writes),
        );
        yield* Story.assert('the leader loaded the Entity', leaderLoaded);

        const late = openTab({
          name: 'late-memory',
          storeLayer: Memory.make(syncStore).layer,
          leadershipLayer,
          peerSync: { channel: bus.factory },
          counters,
        });
        yield* eventually(() => bus.subscribers('late-memory.todo') === 2);
        yield* Effect.sleep(Duration.millis(25));
        yield* Story.assert(
          'the late isolated replica remained empty',
          !received(late.projection.writes),
        );
        yield* Story.assert(
          'Leadership still kept one backend reader',
          counters.readers === 1,
        );
        yield* close(leader, late);
      }),
    }),
    Story.question('Does a shared IndexedDB Sync Store hydrate a late tab?', {
      answer:
        'Yes. The leader persists the accepted Entity in the shared IndexedDB Sync Store. A later tab hydrates its Projection from that durable replica before waiting for Leadership, so it does not need a duplicate backend read.',
      proof: Effect.gen(function* () {
        const indexedDB = new IDBFactory();
        const database = IDB.database({
          databaseName: `leadership-story-${crypto.randomUUID()}`,
          indexedDB,
        });
        const firstAdapter = IDB.make(syncStore, { database });
        yield* firstAdapter.setup;
        const leadershipLayer = inMemoryLeadership();
        const counters = { readers: 0 };
        const leader = openTab({
          name: 'shared-idb',
          storeLayer: firstAdapter.layer,
          leadershipLayer,
          peerSync: false,
          counters,
        });
        const leaderLoaded = yield* eventually(() =>
          received(leader.projection.writes),
        );
        yield* Story.assert('the leader persisted the Entity', leaderLoaded);

        const secondAdapter = IDB.make(syncStore, { database });
        yield* secondAdapter.setup;
        const late = openTab({
          name: 'shared-idb',
          storeLayer: secondAdapter.layer,
          leadershipLayer,
          peerSync: false,
          counters,
        });
        const hydrated = yield* eventually(() =>
          received(late.projection.writes),
        );
        yield* Story.assert(
          'the late tab hydrated from shared IndexedDB',
          hydrated,
        );
        yield* Story.assert(
          'hydration did not start another backend reader',
          counters.readers === 1,
        );
        yield* close(leader, late);
      }),
    }),
    Story.question('Does Leadership turn Peer Sync into authority?', {
      answer:
        'No. Peer Sync remains a best-effort freshness path. When both tabs are already listening, it can keep the waiting Memory replica fresh; missed history still requires durable shared state or a later backend repair.',
      proof: Effect.gen(function* () {
        const bus = makeBus();
        const leadershipLayer = inMemoryLeadership();
        const counters = { readers: 0 };
        let release!: () => void;
        const beforeRead = new Promise<void>((resolve) => {
          release = resolve;
        });
        const first = openTab({
          name: 'live-peers',
          storeLayer: Memory.make(syncStore).layer,
          leadershipLayer,
          peerSync: { channel: bus.factory },
          counters,
          beforeRead,
        });
        const second = openTab({
          name: 'live-peers',
          storeLayer: Memory.make(syncStore).layer,
          leadershipLayer,
          peerSync: { channel: bus.factory },
          counters,
          beforeRead,
        });
        const listening = yield* eventually(
          () => bus.subscribers('live-peers.todo') === 2,
        );
        yield* Story.assert('both Peer Channels were listening', listening);
        release();

        const firstFresh = yield* eventually(() =>
          received(first.projection.writes),
        );
        const secondFresh = yield* eventually(() =>
          received(second.projection.writes),
        );
        yield* Story.assert(
          'both live Memory replicas became fresh',
          firstFresh && secondFresh,
        );
        yield* Story.assert(
          'only the leader read from the backend source',
          counters.readers === 1,
        );
        yield* close(first, second);
      }),
    }),
  ],
});
