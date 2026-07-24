import 'fake-indexeddb/auto';
import { Effect, Schema } from 'effect';
import type { EntityType } from '../../core/index.js';
import { EntityESchema, SingleEntityESchema } from '../../eschema/index.js';
import { describe, expect } from 'vitest';
import {
  moreCoverageDomain,
  moreCoverageTest as it,
} from '../../../laymos/more-coverage.js';
import { vi } from 'vitest';
import { createStdSync } from '../create-std-sync.js';
import {
  offlineStorageGroupName,
  type OfflineStorage,
} from '../offline-storage/index.js';
import { memoryOfflineStorage } from '../offline-storage/memory-offline-storage.js';
import { idbStorage } from '../offline-storage/adapters/idb/index.js';
import { noStrategyState } from '../partitioned/strategy-state.js';

type Todo = {
  id: string;
  listId: string;
  title: string;
};

const todoSchema = EntityESchema.make('Todo', 'id', {
  listId: Schema.String,
  title: Schema.String,
}).build();

const settingsSchema = SingleEntityESchema.make('Settings', {
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

const tombstone = (value: Todo, updated: string): EntityType<Todo> => ({
  value,
  meta: { _e: 'Todo', _v: 'v1', _u: updated, _d: true },
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
  return {
    callbacks: {
      begin: vi.fn(() => events.push('begin')),
      write: vi.fn((operation: unknown) => events.push(operation)),
      commit: vi.fn(() => events.push('commit')),
      truncate: vi.fn(() => events.push('truncate')),
      markReady: vi.fn(() => events.push('ready')),
      collection: {
        update: vi.fn(),
        on: vi.fn(() => vi.fn()),
        status: 'ready',
        size: 0,
        subscriberCount: 0,
      },
    },
    events,
  };
};

const mount = (collection: {
  sync: {
    sync: (callbacks: never) => unknown;
  };
}) => {
  const mounted = makeCallbacks();
  const subscription = collection.sync.sync(mounted.callbacks as never) as {
    cleanup: () => void;
    loadSubset: (options: unknown) => true;
    unloadSubset: (options: unknown) => void;
  };
  return { ...mounted, subscription };
};

const failingWriteStorage = (): OfflineStorage => ({
  descriptor: { kind: 'indexeddb', name: ':test:' },
  group: () => ({
    get: () => Effect.succeed(null),
    getAll: () => Effect.succeed([]),
    put: () => Effect.succeed(undefined),
    putMany: () =>
      Effect.fail({
        _tag: 'OfflineStorageError' as const,
        operation: 'putMany' as const,
        cause: new Error('disk full'),
      }),
    delete: () => Effect.succeed(undefined),
    clear: () => Effect.succeed(undefined),
  }),
  clear: () => Effect.succeed(undefined),
  inspect: () => Effect.succeed([]),
});

const failingReadStorage = (): OfflineStorage => ({
  descriptor: { kind: 'indexeddb', name: ':test:' },
  group: () => ({
    get: () => Effect.succeed(null),
    getAll: () =>
      Effect.fail({
        _tag: 'OfflineStorageError' as const,
        operation: 'getAll' as const,
        cause: new Error('blocked'),
      }),
    put: () => Effect.succeed(undefined),
    putMany: () => Effect.succeed(undefined),
    delete: () => Effect.succeed(undefined),
    clear: () => Effect.succeed(undefined),
  }),
  clear: () => Effect.succeed(undefined),
  inspect: () => Effect.succeed([]),
});

const failingSingletonReadStorage = (): OfflineStorage => ({
  descriptor: { kind: 'indexeddb', name: ':test:' },
  group: () => ({
    get: () =>
      Effect.fail({
        _tag: 'OfflineStorageError' as const,
        operation: 'get' as const,
        cause: new Error('blocked'),
      }),
    getAll: () => Effect.succeed([]),
    put: () => Effect.succeed(undefined),
    putMany: () => Effect.succeed(undefined),
    delete: () => Effect.succeed(undefined),
    clear: () => Effect.succeed(undefined),
  }),
  clear: () => Effect.succeed(undefined),
  inspect: () => Effect.succeed([]),
});

const failingSingletonWriteStorage = (): OfflineStorage => ({
  descriptor: { kind: 'indexeddb', name: ':test:' },
  group: () => ({
    get: () => Effect.succeed(null),
    getAll: () => Effect.succeed([]),
    put: () =>
      Effect.fail({
        _tag: 'OfflineStorageError' as const,
        operation: 'put' as const,
        cause: new Error('disk full'),
      }),
    putMany: () => Effect.succeed(undefined),
    delete: () => Effect.succeed(undefined),
    clear: () => Effect.succeed(undefined),
  }),
  clear: () => Effect.succeed(undefined),
  inspect: () => Effect.succeed([]),
});

moreCoverageDomain('TanStack Sync', () => {
  describe('Offline storage', () => {
    describe('Keyed sync', () => {
      it('projects persisted live SoT entities before marking the collection ready', async () => {
        const storage = memoryOfflineStorage();
        await Effect.runPromise(
          storage
            .group(offlineStorageGroupName.sourceOfTruth(todoSchema.name))
            .put(
              'todo-1',
              entity({ id: 'todo-1', listId: 'inbox', title: 'A' }, '2'),
            ),
        );

        const collection = createStdSync().sync({
          schema: todoSchema,
          offlineStorage: storage,
        });

        const { callbacks, events } = mount(collection);

        await vi.waitFor(() =>
          expect(callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        expect(events).toEqual([
          'begin',
          {
            type: 'insert',
            value: {
              id: 'todo-1',
              listId: 'inbox',
              title: 'A',
              _meta: { _e: 'Todo', _v: 'v1', _u: '2', _d: false },
            },
          },
          'commit',
          'ready',
        ]);
      });

      it('skips stale server entities against persisted SoT while unmounted', async () => {
        const storage = memoryOfflineStorage();
        await Effect.runPromise(
          storage
            .group(offlineStorageGroupName.sourceOfTruth(todoSchema.name))
            .put(
              'todo-1',
              entity({ id: 'todo-1', listId: 'inbox', title: 'newer' }, '2'),
            ),
        );

        const collection = createStdSync().sync({
          schema: todoSchema,
          offlineStorage: storage,
        });

        await Effect.runPromise(
          collection.utils.writeUpsert(
            entity({ id: 'todo-1', listId: 'inbox', title: 'older' }, '1'),
          ),
        );

        const { callbacks, events } = mount(collection);

        await vi.waitFor(() =>
          expect(callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        expect(events).toContainEqual({
          type: 'insert',
          value: {
            id: 'todo-1',
            listId: 'inbox',
            title: 'newer',
            _meta: { _e: 'Todo', _v: 'v1', _u: '2', _d: false },
          },
        });
      });

      it('keeps newer persisted tombstones over older live server entities', async () => {
        const storage = memoryOfflineStorage();
        await Effect.runPromise(
          storage
            .group(offlineStorageGroupName.sourceOfTruth(todoSchema.name))
            .put(
              'todo-1',
              tombstone(
                { id: 'todo-1', listId: 'inbox', title: 'deleted' },
                '2',
              ),
            ),
        );

        const collection = createStdSync().sync({
          schema: todoSchema,
          offlineStorage: storage,
        });

        await Effect.runPromise(
          collection.utils.writeUpsert(
            entity({ id: 'todo-1', listId: 'inbox', title: 'older live' }, '1'),
          ),
        );

        const { callbacks } = mount(collection);

        await vi.waitFor(() =>
          expect(callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        expect(callbacks.write).not.toHaveBeenCalled();
      });

      it('returns a failing Storage effect when writeUpsert cannot persist', async () => {
        const collection = createStdSync().sync({
          schema: todoSchema,
          offlineStorage: failingWriteStorage(),
        });

        const error = await Effect.runPromise(
          collection.utils
            .writeUpsert(
              entity({ id: 'todo-1', listId: 'inbox', title: 'A' }, '1'),
            )
            .pipe(Effect.flip),
        );

        expect(error).toMatchObject({
          _tag: 'Storage',
          reason: 'failed to write Source of Truth entities',
        });
      });

      it('resumes a partition strategy from persisted sync state', async () => {
        const storage = memoryOfflineStorage();
        await Effect.runPromise(
          storage
            .group(offlineStorageGroupName.syncState(todoSchema.name))
            .put(JSON.stringify([['listId', 'inbox']]), {
              strategy: 'test-partition',
              value: { cursor: 'page-2' },
            }),
        );
        const observed: unknown[] = [];

        const collection = createStdSync().sync({
          schema: todoSchema,
          offlineStorage: storage,
          sync: {
            partitions: {
              listId: () => ({
                strategy: {
                  name: 'test-partition',
                  state: cursorState(),
                  run: (ctx) =>
                    ctx.getState.pipe(
                      Effect.tap((state) =>
                        Effect.sync(() => observed.push(state)),
                      ),
                      Effect.asVoid,
                    ),
                },
                forwardFetch: () => Effect.succeed([]),
              }),
            },
          },
        });
        const { callbacks, subscription } = mount(collection);

        await vi.waitFor(() =>
          expect(callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        subscription.loadSubset({
          where: {
            type: 'func',
            name: 'eq',
            args: [
              { type: 'ref', path: ['todos', 'listId'] },
              { type: 'val', value: 'inbox' },
            ],
          },
        });

        await vi.waitFor(() =>
          expect(observed).toEqual([{ cursor: 'page-2' }]),
        );
        subscription.cleanup();
      });

      it('resets partition sync state when the stored strategy name changes', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const storage = memoryOfflineStorage();
        const partitionKey = JSON.stringify([['listId', 'inbox']]);
        await Effect.runPromise(
          storage
            .group(offlineStorageGroupName.syncState(todoSchema.name))
            .put(partitionKey, {
              strategy: 'previous-strategy',
              value: { cursor: 'page-2' },
            }),
        );
        const observed: unknown[] = [];

        const collection = createStdSync().sync({
          schema: todoSchema,
          offlineStorage: storage,
          sync: {
            partitions: {
              listId: () => ({
                strategy: {
                  name: 'current-strategy',
                  state: cursorState(),
                  run: (ctx) =>
                    ctx.getState.pipe(
                      Effect.tap((state) =>
                        Effect.sync(() => observed.push(state)),
                      ),
                      Effect.asVoid,
                    ),
                },
                forwardFetch: () => Effect.succeed([]),
              }),
            },
          },
        });
        const { callbacks, subscription } = mount(collection);

        await vi.waitFor(() =>
          expect(callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        subscription.loadSubset({
          where: {
            type: 'func',
            name: 'eq',
            args: [
              { type: 'ref', path: ['todos', 'listId'] },
              { type: 'val', value: 'inbox' },
            ],
          },
        });

        await vi.waitFor(() => expect(observed).toEqual([{ cursor: null }]));
        await expect(
          Effect.runPromise(
            storage
              .group(offlineStorageGroupName.syncState(todoSchema.name))
              .get(partitionKey),
          ),
        ).resolves.toEqual(
          expect.objectContaining({
            strategy: 'current-strategy',
            value: { cursor: null },
          }),
        );
        expect(warnSpy).toHaveBeenCalledWith(
          '[tanstack-sync] reset sync state for "Todo" because stored strategy "previous-strategy" does not match current strategy "current-strategy"',
        );

        subscription.cleanup();
        warnSpy.mockRestore();
      });

      it('resets partition sync state when the stored state fails schema validation', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const storage = memoryOfflineStorage();
        const partitionKey = JSON.stringify([['listId', 'inbox']]);
        await Effect.runPromise(
          storage
            .group(offlineStorageGroupName.syncState(todoSchema.name))
            .put(partitionKey, {
              strategy: 'test-partition',
              value: { cursor: 123 },
            }),
        );
        const observed: unknown[] = [];

        const collection = createStdSync().sync({
          schema: todoSchema,
          offlineStorage: storage,
          sync: {
            partitions: {
              listId: () => ({
                strategy: {
                  name: 'test-partition',
                  state: cursorState(),
                  run: (ctx) =>
                    ctx.getState.pipe(
                      Effect.tap((state) =>
                        Effect.sync(() => observed.push(state)),
                      ),
                      Effect.asVoid,
                    ),
                },
                forwardFetch: () => Effect.succeed([]),
              }),
            },
          },
        });
        const { callbacks, subscription } = mount(collection);

        await vi.waitFor(() =>
          expect(callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        subscription.loadSubset({
          where: {
            type: 'func',
            name: 'eq',
            args: [
              { type: 'ref', path: ['todos', 'listId'] },
              { type: 'val', value: 'inbox' },
            ],
          },
        });

        await vi.waitFor(() => expect(observed).toEqual([{ cursor: null }]));
        await expect(
          Effect.runPromise(
            storage
              .group(offlineStorageGroupName.syncState(todoSchema.name))
              .get(partitionKey),
          ),
        ).resolves.toEqual(
          expect.objectContaining({
            strategy: 'test-partition',
            value: { cursor: null },
          }),
        );
        expect(warnSpy).toHaveBeenCalledWith(
          '[tanstack-sync] reset sync state for "Todo" strategy "test-partition" because stored state failed schema validation',
        );

        subscription.cleanup();
        warnSpy.mockRestore();
      });

      it('uses collection-local memory when collection offlineStorage is false', async () => {
        const rootStorage = memoryOfflineStorage();
        await Effect.runPromise(
          rootStorage
            .group(offlineStorageGroupName.sourceOfTruth(todoSchema.name))
            .put(
              'root',
              entity({ id: 'root', listId: 'inbox', title: 'root' }, '1'),
            ),
        );

        const collection = createStdSync({ offlineStorage: rootStorage }).sync({
          schema: todoSchema,
          offlineStorage: false,
        });

        await Effect.runPromise(
          collection.utils.writeUpsert(
            entity({ id: 'local', listId: 'inbox', title: 'local' }, '1'),
          ),
        );

        const { callbacks } = mount(collection);

        await vi.waitFor(() =>
          expect(callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        expect(callbacks.write).toHaveBeenCalledTimes(1);
        expect(callbacks.write).toHaveBeenCalledWith({
          type: 'insert',
          value: {
            id: 'local',
            listId: 'inbox',
            title: 'local',
            _meta: expect.objectContaining({
              _e: 'Todo',
              _v: 'v1',
              _u: '1',
              _d: false,
              _c: expect.any(Number),
            }),
          },
        });
      });

      it('does not mark ready when persisted SoT cannot be read on mount', async () => {
        const errorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        const collection = createStdSync().sync({
          schema: todoSchema,
          offlineStorage: failingReadStorage(),
        });

        const { callbacks } = mount(collection);

        await vi.waitFor(() =>
          expect(errorSpy).toHaveBeenCalledWith(
            '[tanstack-sync] failed to read offline storage before collection ready',
            expect.objectContaining({ _tag: 'Storage' }),
          ),
        );
        expect(callbacks.markReady).not.toHaveBeenCalled();
        errorSpy.mockRestore();
      });

      it('marks the inspector collection cleaned-up after keyed collection cleanup', async () => {
        const std = createStdSync();
        const collection = std.sync({
          schema: todoSchema,
        });
        const { callbacks, subscription } = mount(collection);

        await vi.waitFor(() =>
          expect(callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        subscription.cleanup();

        expect(std.inspector.collections.get(todoSchema.name)).toMatchObject({
          status: 'cleaned-up',
          itemCount: 0,
          subscriberCount: 0,
        });
      });

      it('persists registry writes while unmounted and projects them on mount', async () => {
        const storage = memoryOfflineStorage();
        const std = createStdSync({ offlineStorage: storage });
        const collection = std.sync({
          schema: todoSchema,
        });

        std.registry().process({
          persist: true,
          values: [
            entity(
              { id: 'todo-1', listId: 'inbox', title: 'from registry' },
              '1',
            ),
          ],
        });

        await vi.waitFor(async () => {
          await expect(
            Effect.runPromise(
              storage
                .group(offlineStorageGroupName.sourceOfTruth(todoSchema.name))
                .get<EntityType<Todo>>('todo-1'),
            ),
          ).resolves.toMatchObject({
            value: { id: 'todo-1', title: 'from registry' },
          });
        });

        const { callbacks } = mount(collection);

        await vi.waitFor(() =>
          expect(callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        expect(callbacks.write).toHaveBeenCalledWith({
          type: 'insert',
          value: {
            id: 'todo-1',
            listId: 'inbox',
            title: 'from registry',
            _meta: expect.objectContaining({
              _e: 'Todo',
              _v: 'v1',
              _u: '1',
              _d: false,
              _c: expect.any(Number),
            }),
          },
        });
      });
    });

    describe('Single-item sync', () => {
      it('persists singleton SoT across recreated std-sync instances with IndexedDB', async () => {
        const name = `single-item-${crypto.randomUUID()}`;

        const firstCollection = createStdSync({
          offlineStorage: idbStorage({ name, version: 1 }),
        }).singleItemSync({
          schema: settingsSchema,
          strategy: noopSingleStrategy,
        });

        await Effect.runPromise(
          firstCollection.utils.writeServerTruth([
            settingsEntity({ theme: 'dark' }, '1'),
          ]),
        );

        const secondCollection = createStdSync({
          offlineStorage: idbStorage({ name, version: 1 }),
        }).singleItemSync({
          schema: settingsSchema,
          strategy: noopSingleStrategy,
        });

        const { callbacks, events } = mount(secondCollection);

        await vi.waitFor(() =>
          expect(callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        expect(events).toEqual([
          'begin',
          {
            type: 'insert',
            value: {
              theme: 'dark',
              _meta: { _e: 'Settings', _v: 'v1', _u: '1', _d: false },
            },
          },
          'commit',
          'ready',
        ]);
      });

      it('uses collection-local memory when single-item offlineStorage is false', async () => {
        const rootStorage = idbStorage({
          name: `single-item-root-${crypto.randomUUID()}`,
          version: 1,
        });
        await Effect.runPromise(
          rootStorage
            .group(offlineStorageGroupName.sourceOfTruth(settingsSchema.name))
            .put('__singleton__', settingsEntity({ theme: 'root' }, '1')),
        );

        const collection = createStdSync({
          offlineStorage: rootStorage,
        }).singleItemSync({
          schema: settingsSchema,
          offlineStorage: false,
          strategy: noopSingleStrategy,
        });

        await Effect.runPromise(
          collection.utils.writeServerTruth([
            settingsEntity({ theme: 'local' }, '1'),
          ]),
        );

        const { callbacks } = mount(collection);

        await vi.waitFor(() =>
          expect(callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        expect(callbacks.write).toHaveBeenCalledTimes(1);
        expect(callbacks.write).toHaveBeenCalledWith({
          type: 'insert',
          value: {
            theme: 'local',
            _meta: { _e: 'Settings', _v: 'v1', _u: '1', _d: false },
          },
        });
      });

      it('does not mark ready when single-item persisted SoT cannot be read on mount', async () => {
        const errorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        const collection = createStdSync().singleItemSync({
          schema: settingsSchema,
          offlineStorage: failingSingletonReadStorage(),
          strategy: noopSingleStrategy,
        });

        const { callbacks } = mount(collection);

        await vi.waitFor(() =>
          expect(errorSpy).toHaveBeenCalledWith(
            '[tanstack-sync] failed to read offline storage before collection ready',
            expect.objectContaining({ _tag: 'Storage' }),
          ),
        );
        expect(callbacks.markReady).not.toHaveBeenCalled();
        errorSpy.mockRestore();
      });

      it('marks the inspector collection cleaned-up after single-item cleanup', async () => {
        const std = createStdSync();
        const collection = std.singleItemSync({
          schema: settingsSchema,
          strategy: noopSingleStrategy,
        });
        const { callbacks, subscription } = mount(collection);

        await vi.waitFor(() =>
          expect(callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        await subscription.cleanup();

        expect(
          std.inspector.collections.get(settingsSchema.name),
        ).toMatchObject({
          status: 'cleaned-up',
          itemCount: 0,
          subscriberCount: 0,
        });
      });

      it('resumes a single-item strategy from persisted sync state', async () => {
        const storage = memoryOfflineStorage();

        const firstCollection = createStdSync({
          offlineStorage: storage,
        }).singleItemSync({
          schema: settingsSchema,
          strategy: {
            name: 'settings-cursor',
            state: cursorState(),
            run: (ctx) => ctx.setState({ cursor: 'settings-v2' }),
          },
        });

        const firstMount = mount(firstCollection);

        await vi.waitFor(() =>
          expect(firstMount.callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        await vi.waitFor(async () => {
          await expect(
            Effect.runPromise(
              storage
                .group(offlineStorageGroupName.syncState(settingsSchema.name))
                .get('__single__'),
            ),
          ).resolves.toEqual(
            expect.objectContaining({
              strategy: 'settings-cursor',
              value: { cursor: 'settings-v2' },
            }),
          );
        });

        const observed: unknown[] = [];
        const secondCollection = createStdSync({
          offlineStorage: storage,
        }).singleItemSync({
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
        });

        const secondMount = mount(secondCollection);

        await vi.waitFor(() =>
          expect(secondMount.callbacks.markReady).toHaveBeenCalledTimes(1),
        );
        await vi.waitFor(() =>
          expect(observed).toEqual([{ cursor: 'settings-v2' }]),
        );
      });

      it('returns a failing Storage effect when single-item SoT cannot persist', async () => {
        const collection = createStdSync().singleItemSync({
          schema: settingsSchema,
          offlineStorage: failingSingletonWriteStorage(),
          strategy: noopSingleStrategy,
        });

        const error = await Effect.runPromise(
          collection.utils
            .writeServerTruth([settingsEntity({ theme: 'dark' }, '1')])
            .pipe(Effect.flip),
        );

        expect(error).toMatchObject({
          _tag: 'Storage',
          reason: 'failed to write Source of Truth entity',
        });
      });
    });
  });
});
