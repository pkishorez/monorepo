import 'fake-indexeddb/auto';
import { Effect, Schema } from 'effect';
import type { EntityType } from '../../core/index.js';
import { EntityESchema, ESchema } from '../../eschema/index.js';
import { IDB } from '../../db/idb/index.js';
import { Memory } from '../../db/memory/index.js';
import {
  contractLayer,
  OperationFailure,
  type StdTableContract,
} from '../../db/std-table/contract/index.js';
import { describe, expect, it, vi } from 'vitest';
import { createStdSync, syncPersistenceTable } from '../tanstack-sync.js';
import { noStrategyState } from '../domain/strategy-state/index.js';

type Todo = { id: string; listId: string; title: string };

const todoSchema = EntityESchema.make('Todo', 'id', {
  listId: Schema.String,
  title: Schema.String,
}).build();

const settingsSchema = ESchema.make('Settings', {
  theme: Schema.String,
}).build();

const entity = (value: Todo, updated: string): EntityType<Todo> => ({
  value,
  meta: { _e: 'Todo', _v: 'v1', _u: updated, _d: false },
});

const settingsEntity = (
  value: { theme: string },
  updated: string,
): EntityType<{ theme: string }> => ({
  value,
  meta: { _e: 'Settings', _v: 'v1', _u: updated, _d: false },
});

const cursorState = () => ({
  schema: Schema.Struct({ cursor: Schema.NullOr(Schema.String) }),
  empty: { cursor: null },
});

const noopSingleStrategy = {
  name: 'test/noop',
  state: noStrategyState(),
  run: () => Effect.void,
};

const makeCallbacks = () => {
  const events: unknown[] = [];
  const writes: unknown[] = [];
  const probe = { readyCount: 0 };
  return {
    callbacks: {
      begin: () => events.push('begin'),
      write: (operation: unknown) => {
        writes.push(operation);
        events.push(operation);
      },
      commit: () => events.push('commit'),
      truncate: () => events.push('truncate'),
      markReady: () => {
        probe.readyCount += 1;
        events.push('ready');
      },
      collection: {
        update: () => undefined,
        on: () => () => undefined,
        status: 'ready',
        size: 0,
        subscriberCount: 0,
      },
    },
    events,
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
    loadSubset?: (options: unknown) => true;
  };
  return { ...mounted, subscription };
};

const failingLayer = () => {
  const failure = () =>
    Effect.fail(new OperationFailure({ cause: new Error('storage failed') }));
  const contract: StdTableContract = {
    getItem: failure,
    queryItems: failure,
    writeItem: failure,
    transactWriteItems: failure,
    hardDeleteItem: failure,
    hardDeleteEntityItems: failure,
    hardDeleteAllItems: failure,
  };
  return contractLayer(syncPersistenceTable.logicalName, contract);
};

describe('TanStack Sync persistence', () => {
  it('cancels stalled single-item hydration during disposal', async () => {
    const never = () => Effect.never;
    const contract: StdTableContract = {
      getItem: never,
      queryItems: never,
      writeItem: never,
      transactWriteItems: never,
      hardDeleteItem: never,
      hardDeleteEntityItems: never,
      hardDeleteAllItems: never,
    };
    const std = createStdSync({
      persistenceLayer: contractLayer(
        syncPersistenceTable.logicalName,
        contract,
      ),
    });
    const mounted = mount(
      std.singleItemSync({
        schema: settingsSchema,
        strategy: noopSingleStrategy,
      }),
    );

    await expect(std.dispose()).resolves.toBeUndefined();
    expect(mounted.probe.readyCount).toBe(0);
  });

  it('does not wait for persisted registry deliveries before disposing', async () => {
    let releaseWrite: () => void = () => undefined;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const probe = { started: false, completed: false };
    const contract: StdTableContract = {
      getItem: () => Effect.succeed(null),
      queryItems: () => Effect.succeed({ items: [], hasMore: false }),
      writeItem: () =>
        Effect.sync(() => {
          probe.started = true;
        }).pipe(
          Effect.andThen(Effect.promise(() => writeGate)),
          Effect.tap(() =>
            Effect.sync(() => {
              probe.completed = true;
            }),
          ),
        ),
      transactWriteItems: () => Effect.void,
      hardDeleteItem: () => Effect.void,
      hardDeleteEntityItems: () => Effect.succeed(0),
      hardDeleteAllItems: () => Effect.succeed(0),
    };
    const std = createStdSync({
      persistenceLayer: contractLayer(
        syncPersistenceTable.logicalName,
        contract,
      ),
    });
    std.sync({ schema: todoSchema });
    std.registry().process({
      values: [
        entity({ id: 'todo-1', listId: 'inbox', title: 'delayed' }, '1'),
      ],
      persist: true,
    });
    await vi.waitFor(() => expect(probe.started).toBe(true));

    await std.dispose();
    expect(probe.completed).toBe(false);

    releaseWrite();
    await vi.waitFor(() => expect(probe.completed).toBe(true));
  });

  it('uses isolated Memory persistence by default', async () => {
    const first = createStdSync();
    const firstCollection = first.sync({ schema: todoSchema });
    await Effect.runPromise(
      firstCollection.utils.writeUpsert(
        entity({ id: 'todo-1', listId: 'inbox', title: 'first' }, '1'),
      ),
    );

    const second = createStdSync();
    const mounted = mount(second.sync({ schema: todoSchema }));
    await vi.waitFor(() => expect(mounted.probe.readyCount).toBe(1));
    expect(mounted.writes).toEqual([]);

    await mounted.subscription.cleanup();
    await first.dispose();
    await second.dispose();
  });

  it('shares Source of Truth through a supplied adapter layer', async () => {
    const memory = Memory.make(syncPersistenceTable);
    const first = createStdSync({ persistenceLayer: memory.layer });
    const firstCollection = first.sync({ schema: todoSchema });
    await Effect.runPromise(
      firstCollection.utils.writeUpsert(
        entity({ id: 'todo-1', listId: 'inbox', title: 'shared' }, '1'),
      ),
    );
    await first.dispose();

    const second = createStdSync({ persistenceLayer: memory.layer });
    const mounted = mount(second.sync({ schema: todoSchema }));
    await vi.waitFor(() => expect(mounted.probe.readyCount).toBe(1));
    expect(mounted.writes).toContainEqual({
      type: 'insert',
      value: {
        id: 'todo-1',
        listId: 'inbox',
        title: 'shared',
        _meta: expect.objectContaining({ _e: 'Todo', _u: '1' }),
      },
    });

    await mounted.subscription.cleanup();
    await second.dispose();
  });

  it('persists singleton Source of Truth through the StdTable IDB adapter', async () => {
    const database = IDB.database({
      databaseName: `tanstack-sync-${crypto.randomUUID()}`,
    });
    const adapter = IDB.make(syncPersistenceTable, { database });
    await Effect.runPromise(adapter.setup);

    const first = createStdSync({ persistenceLayer: adapter.layer });
    const firstCollection = first.singleItemSync({
      schema: settingsSchema,
      strategy: noopSingleStrategy,
    });
    await Effect.runPromise(
      firstCollection.utils.writeServerTruth([
        settingsEntity({ theme: 'dark' }, '1'),
      ]),
    );
    await first.dispose();

    const second = createStdSync({ persistenceLayer: adapter.layer });
    const mounted = mount(
      second.singleItemSync({
        schema: settingsSchema,
        strategy: noopSingleStrategy,
      }),
    );
    await vi.waitFor(() => expect(mounted.probe.readyCount).toBe(1));
    expect(mounted.writes).toContainEqual({
      type: 'insert',
      value: {
        theme: 'dark',
        _meta: expect.objectContaining({ _e: 'Settings', _u: '1' }),
      },
    });

    await mounted.subscription.cleanup();
    await second.dispose();
  });

  it('resumes strategy state through a shared layer', async () => {
    const memory = Memory.make(syncPersistenceTable);
    const first = createStdSync({ persistenceLayer: memory.layer });
    const saved = { value: false };
    const firstMount = mount(
      first.singleItemSync({
        schema: settingsSchema,
        strategy: {
          name: 'settings-cursor',
          state: cursorState(),
          run: (ctx) =>
            ctx.setState({ cursor: 'settings-v2' }).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  saved.value = true;
                }),
              ),
            ),
        },
      }),
    );
    await vi.waitFor(() => expect(firstMount.probe.readyCount).toBe(1));
    await vi.waitFor(() => expect(saved.value).toBe(true));
    await firstMount.subscription.cleanup();
    await first.dispose();

    const observed: unknown[] = [];
    const second = createStdSync({ persistenceLayer: memory.layer });
    const secondMount = mount(
      second.singleItemSync({
        schema: settingsSchema,
        strategy: {
          name: 'settings-cursor',
          state: cursorState(),
          run: (ctx) =>
            ctx.getState.pipe(
              Effect.tap((state) => Effect.sync(() => observed.push(state))),
              Effect.asVoid,
            ),
        },
      }),
    );
    await vi.waitFor(() => expect(secondMount.probe.readyCount).toBe(1));
    await vi.waitFor(() =>
      expect(observed).toEqual([{ cursor: 'settings-v2' }]),
    );

    await secondMount.subscription.cleanup();
    await second.dispose();
  });

  it('maps adapter write failures to WriteError.Storage', async () => {
    const std = createStdSync({ persistenceLayer: failingLayer() });
    const collection = std.sync({ schema: todoSchema });
    const error = await Effect.runPromise(
      collection.utils
        .writeUpsert(entity({ id: 'todo-1', listId: 'inbox', title: 'A' }, '1'))
        .pipe(Effect.flip),
    );

    expect(error).toMatchObject({
      _tag: 'Storage',
      reason: 'failed to write Source of Truth entities',
    });
    await std.dispose();
  });

  it('does not mark ready when adapter hydration fails', async () => {
    const events: unknown[] = [];
    const std = createStdSync({
      persistenceLayer: failingLayer(),
      onEvent: (event) => Effect.sync(() => events.push(event)),
    });
    const mounted = mount(std.sync({ schema: todoSchema }));

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events).toContainEqual({
      _tag: 'InitializationFailed',
      collection: 'Todo',
      cause: expect.objectContaining({ _tag: 'Storage' }),
    });
    expect(mounted.probe.readyCount).toBe(0);

    await mounted.subscription.cleanup();
    await std.dispose();
  });

  it('disposes active collection lifecycles and rejects later use', async () => {
    const std = createStdSync();
    const collection = std.sync({ schema: todoSchema });
    const mounted = mount(collection);
    await vi.waitFor(() => expect(mounted.probe.readyCount).toBe(1));

    await std.dispose();

    expect(() => std.sync({ schema: todoSchema })).toThrow(
      'instance is disposed',
    );
    expect(() => std.registry()).toThrow('instance is disposed');
    expect(() =>
      collection.utils.writeUpsert(
        entity({ id: 'late', listId: 'inbox', title: 'late' }, '1'),
      ),
    ).toThrow('instance is disposed');
  });
});
