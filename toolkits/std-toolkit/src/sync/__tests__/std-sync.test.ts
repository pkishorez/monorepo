import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Schema } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Entity } from '../../core/index.js';
import { EntityESchema } from '../../eschema/index.js';
import { storedReplicaEntity } from '../domain/stored-entity/index.js';
import { makeSyncStore } from '../platform/sync-store/index.js';
import type { SyncEvent } from '../domain/sync-event/index.js';
import { createStdSync, strategy } from '../index.js';
import { backend, sharedPlatform, Todo, todo } from './support.js';

const open: Array<{ dispose: () => Promise<void> }> = [];
const track = <T extends { dispose: () => Promise<void> }>(std: T) => {
  open.push(std);
  return std;
};
afterEach(async () => {
  await Promise.all(open.splice(0).map((std) => std.dispose()));
  vi.restoreAllMocks();
});

const titles = (rows: ReadonlyArray<{ title: string }>) =>
  rows.map((row) => row.title).sort();

describe('a Std Sync Collection', () => {
  it('fills from its global strategy', async () => {
    const server = backend([todo('a', 1), todo('b', 2), todo('c', 3)]);
    const std = track(createStdSync({ name: 'global' }));
    const todos = std.collection(Todo, {
      sync: { global: strategy.oldToNew({ fetch: server.fetch }) },
    });
    await todos.preload();
    await vi.waitFor(() =>
      expect(titles(todos.toArray)).toEqual(['a', 'b', 'c']),
    );
  });

  it('opens from its local copy after a reload and resumes from its cursor', async () => {
    const platform = sharedPlatform();
    const server = backend([todo('a', 1), todo('b', 2)]);
    const first = createStdSync({ name: 'reload', platform });
    const before = first.collection(Todo, {
      sync: { global: strategy.oldToNew({ fetch: server.fetch }) },
    });
    await before.preload();
    await vi.waitFor(() => expect(before.size).toBe(2));
    await first.dispose();

    server.add(todo('c', 3));
    const afters: Array<string | null> = [];
    const gate = Promise.withResolvers<void>();
    const second = track(createStdSync({ name: 'reload', platform }));
    const after = second.collection(Todo, {
      sync: {
        global: strategy.oldToNew({
          fetch: (input) => {
            afters.push(input.after?.value.id ?? null);
            return Effect.promise(() => gate.promise).pipe(
              Effect.andThen(server.fetch(input)),
            );
          },
        }),
      },
    });
    await after.preload();
    expect(titles(after.toArray)).toEqual(['a', 'b']);
    gate.resolve();
    await vi.waitFor(() =>
      expect(titles(after.toArray)).toEqual(['a', 'b', 'c']),
    );
    expect(afters[0]).toBe('b');
  });

  it('runs a Partition Sync while a query filters on its key path', async () => {
    const server = backend([
      todo('a1', 1, { listId: 'a' }),
      todo('b1', 2, { listId: 'b' }),
    ]);
    const started: string[] = [];
    const std = track(createStdSync({ name: 'partitions' }));
    const todos = std.collection(Todo, {
      sync: {
        partitions: {
          listId: (listId) => {
            started.push(listId);
            return strategy.oldToNew({
              fetch: (input) =>
                server
                  .fetch(input)
                  .pipe(
                    Effect.map((rows) =>
                      rows.filter((row) => row.value.listId === listId),
                    ),
                  ),
            });
          },
        },
      },
    });
    const listA = createLiveQueryCollection({
      query: (q) =>
        q.from({ todo: todos }).where(({ todo }) => eq(todo.listId, 'a')),
      startSync: true,
      gcTime: 0,
    });
    try {
      await listA.preload();
      await vi.waitFor(() => expect(titles(listA.toArray)).toEqual(['a1']));
      expect(started).toEqual(['a']);
    } finally {
      await listA.cleanup();
    }
  });

  it('stores what the Backend confirms and rolls back what it refuses', async () => {
    const std = track(createStdSync({ name: 'writes' }));
    const todos = std.collection(Todo, {
      onInsert: (items) =>
        items[0]?.title === 'refused'
          ? Effect.fail('refused')
          : Effect.succeed(
              items.map((item) => todo(item.id, 9, { title: item.title })),
            ),
    });
    await todos.preload();
    await todos.insert({ id: 'x', listId: 'a', title: 'kept' }).isPersisted
      .promise;
    await vi.waitFor(() =>
      expect(todos.get('x')).toMatchObject({ title: 'kept', $synced: true }),
    );

    const refused = todos.insert({ id: 'y', listId: 'a', title: 'refused' });
    await expect(refused.isPersisted.promise).rejects.toBeDefined();
    expect(todos.get('y')).toBeUndefined();
  });

  it('shows rich values and stores their encoded form', async () => {
    const Task = EntityESchema.make('Task', 'id', {
      dueAt: Schema.DateFromString,
    }).build();
    const due = new Date('2026-05-01T09:00:00.000Z');
    const confirmed: Entity<{ id: string; dueAt: Date }> = {
      value: { id: 't', dueAt: due },
      meta: { _e: 'Task', _v: 'v1', _u: '1', _d: false },
    };
    const platform = sharedPlatform();
    const first = createStdSync({ name: 'dates', platform });
    const tasks = first.collection(Task, {
      sync: {
        global: strategy.oldToNew({
          fetch: ({ after }) => Effect.succeed(after ? [] : [confirmed]),
        }),
      },
    });
    await tasks.preload();
    await vi.waitFor(() => expect(tasks.get('t')?.dueAt).toEqual(due));
    await first.dispose();

    const second = track(createStdSync({ name: 'dates', platform }));
    const reloaded = second.collection(Task);
    await reloaded.preload();
    expect(reloaded.get('t')?.dueAt).toEqual(due);
  });

  it('refuses two Collections for one schema', () => {
    const std = track(createStdSync({ name: 'Names Here' }));
    std.collection(Todo);
    expect(() => std.collection(Todo)).toThrow(
      'collection "names-here.todo" is already registered',
    );
  });

  it('stops for an Entity from newer code and reports it once', async () => {
    const reported: SyncEvent[] = [];
    let runs = 0;
    const std = track(
      createStdSync({
        name: 'outdated',
        onEvent: (event) => Effect.sync(() => void reported.push(event)),
      }),
    );
    const todos = std.collection(Todo, {
      sync: {
        global: strategy.oldToNew({
          fetch: () =>
            Effect.suspend(() => {
              runs += 1;
              return Schema.decodeUnknownEffect(Todo.entity)({
                value: { id: 'a', listId: 'a', title: 'a' },
                meta: { _e: 'Todo', _v: 'v2', _u: '1', _d: false },
              }).pipe(Effect.map((entity) => [entity]));
            }),
        }),
      },
    });
    await todos.preload();
    await vi.waitFor(() => expect(runs).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runs).toBe(1);
    expect(reported.map((event) => event._tag)).toEqual([
      'OutdatedApplication',
    ]);
  });
});

describe('two tabs sharing a platform', () => {
  it('only the leader reads the Backend; the other tab hears the Doorbell', async () => {
    const platform = sharedPlatform();
    const server = backend([todo('a', 1)]);
    const reads = { one: 0, two: 0 };
    const tab = (name: 'one' | 'two') => {
      const std = track(createStdSync({ name: 'tabs', platform }));
      return std.collection(Todo, {
        sync: {
          global: strategy.oldToNew({
            fetch: (input) => {
              reads[name] += 1;
              return server.fetch(input);
            },
            pollEvery: '5 millis',
          }),
        },
      });
    };
    const one = tab('one');
    await one.preload();
    await vi.waitFor(() => expect(one.size).toBe(1));
    const two = tab('two');
    await two.preload();

    server.add(todo('b', 2));
    await vi.waitFor(() => expect(titles(two.toArray)).toEqual(['a', 'b']));
    expect(reads.one).toBeGreaterThan(0);
    expect(reads.two).toBe(0);
  });
});

describe('reading the shared Sync Replica', () => {
  it('buffers a Doorbell rung after the initial page was read', async () => {
    const platform = sharedPlatform();
    const writer = track(createStdSync({ name: 'hydrating', platform }));
    const writes = writer.collection(Todo, {
      onInsert: (items) =>
        Effect.succeed(items.map((item) => todo(item.id, 1))),
    });
    await writes.preload();

    const read = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const query = storedReplicaEntity.query;
    vi.spyOn(storedReplicaEntity, 'query').mockImplementationOnce((...args) =>
      query(...args).pipe(
        Effect.tap(() =>
          Effect.promise(() => {
            read.resolve();
            return resume.promise;
          }),
        ),
      ),
    );
    const follower = track(createStdSync({ name: 'hydrating', platform }));
    const rows = follower.collection(Todo);
    const ready = rows.preload();
    try {
      await read.promise;
      await writes.insert({ id: 'new', listId: 'a', title: 'new' }).isPersisted
        .promise;
    } finally {
      resume.resolve();
    }
    await ready;
    await vi.waitFor(() => expect(titles(rows.toArray)).toEqual(['new']));
  });

  it.each(['hydration', 'doorbell'] as const)(
    'reports Outdated Application once during %s',
    async (phase) => {
      const platform = sharedPlatform();
      const local = track(makeSyncStore(platform.store('local-version')));
      const reported: SyncEvent[] = [];
      const std = track(
        createStdSync({
          name: 'local-version',
          platform,
          onEvent: (event) => Effect.sync(() => void reported.push(event)),
        }),
      );
      const rows = std.collection(Todo);
      const writeNewer = () =>
        Effect.runPromise(
          local.provide(
            storedReplicaEntity.insert({
              collection: 'local-version.todo',
              key: 'new',
              seq: '00000000000000000000000000000001',
              entity: {
                ...todo('new', 1),
                meta: { ...todo('new', 1).meta, _v: 'v2' },
              },
            }),
          ),
        );
      if (phase === 'hydration') await writeNewer();
      await rows.preload();
      if (phase === 'doorbell') await writeNewer();
      await Effect.runPromise(platform.doorbell.ring('local-version.todo'));
      await vi.waitFor(() =>
        expect(reported).toEqual([
          {
            _tag: 'OutdatedApplication',
            collection: 'local-version.todo',
            version: 'v2',
            latestVersion: 'v1',
          },
        ]),
      );
      await Effect.runPromise(platform.doorbell.ring('local-version.todo'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(reported).toHaveLength(1);
      expect(rows.size).toBe(0);
    },
  );
});
