import 'fake-indexeddb/auto';
import { Effect, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../core/index.js';
import { IDB } from '../../db/idb/index.js';
import { Memory } from '../../db/memory/index.js';
import { EntityESchema, ESchema } from '../../eschema/index.js';
import { noStrategyState } from '../domain/strategy-state/index.js';
import type { SyncEvent } from '../domain/sync-event/index.js';
import { createStdSync, syncStore, type PeerChannelFactory } from '../sync.js';

type Todo = { id: string; title: string };

const todoSchema = EntityESchema.make('Todo', 'id', {
  title: Schema.String,
}).build();

const settingsSchema = ESchema.make('Settings', {
  theme: Schema.String,
}).build();

const todo = (
  id: string,
  updated: string,
  title = `title ${updated}`,
  deleted = false,
): EntityType<Todo> => ({
  value: { id, title },
  meta: { _v: 'v1', _e: 'Todo', _d: deleted, _u: updated },
});

const settings = (
  theme: string,
  updated: string,
): EntityType<{ theme: string }> => ({
  value: { theme },
  meta: { _v: 'v1', _e: 'Settings', _d: false, _u: updated },
});

const noopSingleStrategy = {
  name: 'test/noop',
  state: noStrategyState(),
  run: () => Effect.void,
};

const makeBus = () => {
  const subscriptions = new Map<string, Set<(message: unknown) => void>>();
  const names: string[] = [];
  const messages: Array<{ name: string; message: unknown }> = [];
  let cleanupCount = 0;
  let broadcasts = 0;
  let drop = false;

  const factory: PeerChannelFactory = (name) => {
    names.push(name);
    let own: ((message: unknown) => void) | null = null;
    return {
      broadcast: async (message) => {
        broadcasts += 1;
        messages.push({ name, message });
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
          cleanupCount += 1;
          handlers.delete(handler);
        };
      },
    };
  };

  return {
    factory,
    names,
    messages,
    broadcasts: () => broadcasts,
    cleanupCount: () => cleanupCount,
    subscribers: (name: string) => subscriptions.get(name)?.size ?? 0,
    setDrop: (value: boolean) => {
      drop = value;
    },
  };
};

const makeMount = () => {
  const writes: unknown[] = [];
  let ready = 0;
  return {
    callbacks: {
      begin: () => undefined,
      write: (operation: unknown) => writes.push(operation),
      commit: () => undefined,
      truncate: () => undefined,
      markReady: () => {
        ready += 1;
      },
      collection: {
        update: () => undefined,
        on: () => () => undefined,
        status: 'ready',
        size: 0,
        subscriberCount: 0,
      },
    },
    writes,
    ready: () => ready,
  };
};

const mount = (config: { sync: { sync: (callbacks: never) => unknown } }) => {
  const mounted = makeMount();
  const subscription = config.sync.sync(mounted.callbacks as never) as {
    cleanup: () => Promise<void>;
  };
  return { ...mounted, subscription };
};

const updateFor = (entity: EntityType<unknown>) => ({
  type: 'update',
  value: expect.objectContaining({
    ...(entity.value as object),
    _meta: expect.objectContaining({ _u: entity.meta._u }),
  }),
});

describe('Peer Sync replica integration', () => {
  it('converges separate Memory replicas, broadcasts accepted entities only, and never relays', async () => {
    const bus = makeBus();
    const firstStore = Memory.make(syncStore);
    const secondStore = Memory.make(syncStore);
    const first = createStdSync({
      name: 'Acme',
      storeLayer: firstStore.layer,
      peerSync: { channel: bus.factory },
    });
    const second = createStdSync({
      name: 'Acme',
      storeLayer: secondStore.layer,
      peerSync: { channel: bus.factory },
    });
    const firstConfig = first.sync({ schema: todoSchema });
    const secondMounted = mount(second.sync({ schema: todoSchema }));
    await vi.waitFor(() => expect(bus.subscribers('acme.todo')).toBe(2));
    await vi.waitFor(() => expect(secondMounted.ready()).toBe(1));

    const accepted = await Effect.runPromise(
      firstConfig.utils.applyToSyncReplica([todo('a', '2'), todo('a', '1')]),
    );
    expect(accepted).toHaveLength(1);
    await vi.waitFor(() =>
      expect(secondMounted.writes).toContainEqual(updateFor(todo('a', '2'))),
    );
    expect(bus.broadcasts()).toBe(1);
    expect(bus.messages[0]).toEqual({
      name: 'acme.todo',
      message: {
        version: 1,
        entities: [expect.objectContaining({ value: todo('a', '2').value })],
      },
    });

    expect(
      await Effect.runPromise(
        firstConfig.utils.applyToSyncReplica(todo('a', '1')),
      ),
    ).toEqual([]);
    expect(
      await Effect.runPromise(
        firstConfig.utils.applyToSyncReplica(todo('a', '2')),
      ),
    ).toEqual([]);
    expect(bus.broadcasts()).toBe(1);

    await Effect.runPromise(
      firstConfig.utils.applyToSyncReplica(todo('a', '3', 'removed', true)),
    );
    await vi.waitFor(() =>
      expect(secondMounted.writes).toContainEqual({ type: 'delete', key: 'a' }),
    );
    expect(bus.broadcasts()).toBe(2);

    await secondMounted.subscription.cleanup();
    expect(bus.cleanupCount()).toBe(0);
    await first.dispose();
    await second.dispose();
    expect(bus.cleanupCount()).toBe(2);
  });

  it('subscribes before projection mount and hydrates peer entities on a later mount', async () => {
    const bus = makeBus();
    const first = createStdSync({
      name: 'later',
      peerSync: { channel: bus.factory },
    });
    const second = createStdSync({
      name: 'later',
      peerSync: { channel: bus.factory },
    });
    const firstConfig = first.sync({ schema: todoSchema });
    const secondConfig = second.sync({ schema: todoSchema });
    await vi.waitFor(() => expect(bus.subscribers('later.todo')).toBe(2));

    await Effect.runPromise(
      firstConfig.utils.applyToSyncReplica(todo('a', '1')),
    );
    const mounted = mount(secondConfig);
    await vi.waitFor(() => expect(mounted.ready()).toBe(1));
    expect(mounted.writes).toContainEqual(updateFor(todo('a', '1')));

    await mounted.subscription.cleanup();
    await first.dispose();
    await second.dispose();
  });

  it('can disable peers and keeps persist:false registry values tab-local', async () => {
    const bus = makeBus();
    const first = createStdSync({
      name: 'local',
      peerSync: { channel: bus.factory },
    });
    const disabled = createStdSync({
      name: 'local',
      peerSync: false,
    });
    const firstMounted = mount(first.sync({ schema: todoSchema }));
    const disabledMounted = mount(disabled.sync({ schema: todoSchema }));
    await vi.waitFor(() => expect(bus.subscribers('local.todo')).toBe(1));

    first.registry().process({
      values: [todo('preview', '1')],
      persist: false,
    });
    await vi.waitFor(() =>
      expect(firstMounted.writes).toContainEqual(
        updateFor(todo('preview', '1')),
      ),
    );
    expect(disabledMounted.writes).not.toContainEqual(
      updateFor(todo('preview', '1')),
    );
    expect(bus.broadcasts()).toBe(0);

    await Effect.runPromise(
      first
        .sync({ schema: EntityESchema.make('Other', 'id', {}).build() })
        .utils.applyToSyncReplica({
          value: { id: 'x' },
          meta: { _v: 'v1', _e: 'Other', _d: false, _u: '1' },
        }),
    );
    expect(bus.names).toEqual(['local.todo', 'local.other']);

    await firstMounted.subscription.cleanup();
    await disabledMounted.subscription.cleanup();
    await first.dispose();
    await disabled.dispose();
  });

  it('advances a mounted shared-IDB receiver when peer convergence is already a no-op', async () => {
    const databaseName = `peer-sync-${crypto.randomUUID()}`;
    const firstAdapter = IDB.make(syncStore, {
      database: IDB.database({ databaseName }),
    });
    const secondAdapter = IDB.make(syncStore, {
      database: IDB.database({ databaseName }),
    });
    await Effect.runPromise(firstAdapter.setup);
    await Effect.runPromise(secondAdapter.setup);
    const bus = makeBus();
    const first = createStdSync({
      name: 'shared-idb',
      storeLayer: firstAdapter.layer,
      peerSync: { channel: bus.factory },
    });
    const second = createStdSync({
      name: 'shared-idb',
      storeLayer: secondAdapter.layer,
      peerSync: { channel: bus.factory },
    });
    const firstConfig = first.sync({ schema: todoSchema });
    const secondMounted = mount(second.sync({ schema: todoSchema }));
    await vi.waitFor(() => expect(bus.subscribers('shared-idb.todo')).toBe(2));
    await vi.waitFor(() => expect(secondMounted.ready()).toBe(1));

    await Effect.runPromise(
      firstConfig.utils.applyToSyncReplica(todo('idb', '1')),
    );
    await vi.waitFor(() =>
      expect(secondMounted.writes).toContainEqual(updateFor(todo('idb', '1'))),
    );
    expect(bus.broadcasts()).toBe(1);

    await secondMounted.subscription.cleanup();
    await first.dispose();
    await second.dispose();
  });

  it('supports single-item peers and repairs a missed delivery through the backend path', async () => {
    const bus = makeBus();
    const first = createStdSync({
      name: 'preferences',
      peerSync: { channel: bus.factory },
    });
    const second = createStdSync({
      name: 'preferences',
      peerSync: { channel: bus.factory },
    });
    const firstConfig = first.singleItemSync({
      schema: settingsSchema,
      strategy: noopSingleStrategy,
    });
    const secondConfig = second.singleItemSync({
      schema: settingsSchema,
      strategy: noopSingleStrategy,
    });
    const mounted = mount(secondConfig);
    await vi.waitFor(() =>
      expect(bus.subscribers('preferences.settings')).toBe(2),
    );
    await vi.waitFor(() => expect(mounted.ready()).toBe(1));

    bus.setDrop(true);
    await Effect.runPromise(
      firstConfig.utils.applyToSyncReplica([settings('dark', '1')]),
    );
    expect(mounted.writes).toEqual([]);

    // The same apply path is used by a later backend poll/push and repairs the miss.
    await Effect.runPromise(
      secondConfig.utils.applyToSyncReplica([settings('dark', '1')]),
    );
    await vi.waitFor(() =>
      expect(mounted.writes).toContainEqual(updateFor(settings('dark', '1'))),
    );

    await mounted.subscription.cleanup();
    await first.dispose();
    await second.dispose();
  });

  it('reports broadcast failures without failing confirmed writes or mutations', async () => {
    const events: SyncEvent[] = [];
    const failingChannel: PeerChannelFactory = () => ({
      broadcast: async () => {
        throw new Error('send failed');
      },
      subscribe: async () => async () => undefined,
    });
    const confirmed = todo('mutation', '1');
    const std = createStdSync({
      name: 'failures',
      peerSync: { channel: failingChannel },
      onEvent: (event) => Effect.sync(() => events.push(event)),
    });
    const config = std.sync({
      schema: todoSchema,
      onInsert: (item) => Effect.succeed(todo(item.id, '2', item.title)),
    });

    await expect(
      Effect.runPromise(config.utils.applyToSyncReplica(confirmed)),
    ).resolves.toHaveLength(1);
    await expect(
      config.onInsert!({
        transaction: {
          mutations: [
            {
              key: 'mutation-2',
              modified: { id: 'mutation-2', title: 'inserted' },
            },
          ],
        },
      } as never),
    ).resolves.toBeUndefined();
    expect(events).toContainEqual(
      expect.objectContaining({ _tag: 'PeerSyncFailed', phase: 'broadcast' }),
    );

    await std.dispose();
  });
});
