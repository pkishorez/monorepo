import 'fake-indexeddb/auto';
import { Effect, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../core/index.js';
import { EntityESchema } from '../../eschema/index.js';
import { Memory } from '../../db/memory/index.js';
import { makeTableContract } from '../../db/memory/table/index.js';
import {
  contractLayer,
  type EncodedItem,
} from '../../db/std-table/contract/index.js';
import { createStdSync, syncPersistenceTable } from '../sync.js';
import type {
  ChangeNoticeChannel,
  ChannelFactory,
} from '../runtime/change-notice/index.js';
import type { SyncPersistenceLayer } from '../persistence/sync-persistence-table/index.js';

type Todo = { id: string; listId: string; title: string };

const todoSchema = EntityESchema.make('Todo', 'id', {
  listId: Schema.String,
  title: Schema.String,
}).build();

const entity = (value: Todo, updated: string): EntityType<Todo> => ({
  value,
  meta: { _e: 'Todo', _v: 'v1', _u: updated, _d: false },
});

const tombstone = (value: Todo, updated: string): EntityType<Todo> => ({
  value,
  meta: { _e: 'Todo', _v: 'v1', _u: updated, _d: true },
});

// Stands in for BroadcastChannel: same name, every peer but the sender.
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

const makeCallbacks = () => {
  const writes: unknown[] = [];
  const probe = { readyCount: 0 };
  return {
    callbacks: {
      begin: () => undefined,
      write: (operation: unknown) => writes.push(operation),
      commit: () => undefined,
      truncate: () => undefined,
      markReady: () => {
        probe.readyCount += 1;
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
    probe,
  };
};

const mount = (collection: {
  sync: { sync: (callbacks: never) => unknown };
}) => {
  const mounted = makeCallbacks();
  const subscription = collection.sync.sync(mounted.callbacks as never) as {
    cleanup: () => Promise<void>;
  };
  return { ...mounted, subscription };
};

const openTab = (layer: SyncPersistenceLayer, channel: ChannelFactory) => {
  const std = createStdSync({
    persistenceLayer: layer,
    notices: { scope: 'test', channel },
  });
  const collection = std.sync({ schema: todoSchema });
  return { std, collection, mounted: mount(collection) };
};

describe('cross-tab projection', () => {
  it('serializes hydration and write projection advances', async () => {
    const items = new Map<string, EncodedItem>();
    const base = makeTableContract(syncPersistenceTable, items);
    let releaseHydration: () => void = () => undefined;
    const hydrationGate = new Promise<void>((resolve) => {
      releaseHydration = resolve;
    });
    let queries = 0;
    let activeQueries = 0;
    let maximumActiveQueries = 0;
    const layer = contractLayer(syncPersistenceTable.logicalName, {
      ...base,
      queryItems: (request) =>
        Effect.gen(function* () {
          activeQueries += 1;
          maximumActiveQueries = Math.max(maximumActiveQueries, activeQueries);
          if (queries++ === 0) {
            yield* Effect.promise(() => hydrationGate);
          }
          return yield* base.queryItems(request);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              activeQueries -= 1;
            }),
          ),
        ),
    });
    const tab = openTab(layer, makeChannelHub());
    await vi.waitFor(() => expect(activeQueries).toBe(1));

    const write = Effect.runPromise(
      tab.collection.utils.writeUpsert(
        entity({ id: 'todo-1', listId: 'inbox', title: 'new' }, '1'),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(maximumActiveQueries).toBe(1);

    releaseHydration();
    await write;
    await vi.waitFor(() => expect(tab.mounted.probe.readyCount).toBe(1));
    expect(maximumActiveQueries).toBe(1);

    await tab.mounted.subscription.cleanup();
    await tab.std.dispose();
  });

  it('projects another tab’s write without writing SoT twice', async () => {
    const memory = Memory.make(syncPersistenceTable);
    const channel = makeChannelHub();
    const a = openTab(memory.layer, channel);
    const b = openTab(memory.layer, channel);
    await vi.waitFor(() => expect(b.mounted.probe.readyCount).toBe(1));

    await Effect.runPromise(
      a.collection.utils.writeUpsert(
        entity({ id: 'todo-1', listId: 'inbox', title: 'from A' }, '1'),
      ),
    );

    await vi.waitFor(() =>
      expect(b.mounted.writes).toContainEqual({
        type: 'update',
        value: {
          id: 'todo-1',
          listId: 'inbox',
          title: 'from A',
          _meta: expect.objectContaining({ _e: 'Todo', _u: '1' }),
        },
      }),
    );

    await a.mounted.subscription.cleanup();
    await b.mounted.subscription.cleanup();
    await a.std.dispose();
    await b.std.dispose();
  });

  it('notifies another tab when the writing collection is unmounted', async () => {
    const memory = Memory.make(syncPersistenceTable);
    const channel = makeChannelHub();
    const writerStd = createStdSync({
      persistenceLayer: memory.layer,
      notices: { scope: 'test', channel },
    });
    const writer = writerStd.sync({ schema: todoSchema });
    const reader = openTab(memory.layer, channel);
    await vi.waitFor(() => expect(reader.mounted.probe.readyCount).toBe(1));

    await Effect.runPromise(
      writer.utils.writeUpsert(
        entity({ id: 'todo-1', listId: 'inbox', title: 'background' }, '1'),
      ),
    );

    await vi.waitFor(() =>
      expect(reader.mounted.writes).toContainEqual({
        type: 'update',
        value: {
          id: 'todo-1',
          listId: 'inbox',
          title: 'background',
          _meta: expect.objectContaining({ _e: 'Todo', _u: '1' }),
        },
      }),
    );

    await reader.mounted.subscription.cleanup();
    await writerStd.dispose();
    await reader.std.dispose();
  });

  it('projects a tombstone from another tab as a delete', async () => {
    const memory = Memory.make(syncPersistenceTable);
    const channel = makeChannelHub();
    const a = openTab(memory.layer, channel);
    const b = openTab(memory.layer, channel);
    await vi.waitFor(() => expect(b.mounted.probe.readyCount).toBe(1));

    const todo = { id: 'todo-1', listId: 'inbox', title: 'doomed' };
    await Effect.runPromise(a.collection.utils.writeUpsert(entity(todo, '1')));
    await vi.waitFor(() => expect(b.mounted.writes.length).toBeGreaterThan(0));

    await Effect.runPromise(
      a.collection.utils.writeUpsert(tombstone(todo, '2')),
    );

    await vi.waitFor(() =>
      expect(b.mounted.writes).toContainEqual({
        type: 'delete',
        key: 'todo-1',
      }),
    );

    await a.mounted.subscription.cleanup();
    await b.mounted.subscription.cleanup();
    await a.std.dispose();
    await b.std.dispose();
  });

  it('does not project a tombstone that predates the mount', async () => {
    const memory = Memory.make(syncPersistenceTable);
    const channel = makeChannelHub();
    const a = openTab(memory.layer, channel);
    const todo = { id: 'todo-1', listId: 'inbox', title: 'gone' };
    await Effect.runPromise(a.collection.utils.writeUpsert(entity(todo, '1')));
    await Effect.runPromise(
      a.collection.utils.writeUpsert(tombstone(todo, '2')),
    );

    const b = openTab(memory.layer, channel);
    await vi.waitFor(() => expect(b.mounted.probe.readyCount).toBe(1));
    expect(b.mounted.writes).toEqual([]);

    await a.mounted.subscription.cleanup();
    await b.mounted.subscription.cleanup();
    await a.std.dispose();
    await b.std.dispose();
  });

  it('replays idempotently when a tab rescans the same range', async () => {
    const memory = Memory.make(syncPersistenceTable);
    const channel = makeChannelHub();
    const a = openTab(memory.layer, channel);
    const b = openTab(memory.layer, channel);
    await vi.waitFor(() => expect(b.mounted.probe.readyCount).toBe(1));

    await Effect.runPromise(
      a.collection.utils.writeUpsert(
        entity({ id: 'todo-1', listId: 'inbox', title: 'once' }, '1'),
      ),
    );
    await vi.waitFor(() => expect(b.mounted.writes.length).toBe(1));

    // A second notice with nothing new behind it must project nothing.
    await Effect.runPromise(
      a.collection.utils.writeUpsert(
        entity({ id: 'todo-1', listId: 'inbox', title: 'stale' }, '0'),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(b.mounted.writes.length).toBe(1);

    await a.mounted.subscription.cleanup();
    await b.mounted.subscription.cleanup();
    await a.std.dispose();
    await b.std.dispose();
  });
});
