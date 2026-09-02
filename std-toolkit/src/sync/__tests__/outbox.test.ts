import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import { Effect, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { DecodedEntity } from '../../core/index.js';
import { EntityESchema } from '../../eschema/index.js';
import { Memory } from '../../db/memory/index.js';
import {
  createStdSync,
  syncStore,
  type Connectivity,
  type SyncStoreLayer,
} from '../std-sync/std-sync.js';
import { storedOutboxEntryEntity } from '../domain/stored-entity/index.js';

type Todo = { id: string; title: string; done: boolean };

const todoSchema = EntityESchema.make('Todo', 'id', {
  title: Schema.String,
  done: Schema.Boolean,
}).build();

const confirmed = (
  value: Todo,
  u: string,
  deleted = false,
): DecodedEntity<Todo> => ({
  value,
  meta: { _e: 'Todo', _d: deleted, _u: u },
});

const network = (initial: boolean) => {
  let online = initial;
  const listeners = new Set<() => void>();
  const port: Connectivity = {
    isOnline: () => online,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    set: (next: boolean) => {
      online = next;
      for (const listener of listeners) listener();
    },
  };
};

const outboxEntries = (memory: { layer: SyncStoreLayer }, name: string) =>
  Effect.runPromise(
    storedOutboxEntryEntity
      .query('primary', { pk: { sync: name }, '>=': null })
      .pipe(
        Effect.provide(memory.layer),
        Effect.map((page) => page.items.map((item) => item.value)),
      ),
  );

const setup = (options: {
  memory?: { layer: SyncStoreLayer };
  online?: boolean;
  onInsert?: (
    items: ReadonlyArray<Todo>,
  ) => Effect.Effect<ReadonlyArray<DecodedEntity<Todo>>, unknown>;
  onUpdate?: (payload: {
    current: Todo;
    updates: Partial<Omit<Todo, 'id'>>;
  }) => Effect.Effect<DecodedEntity<Todo>, unknown>;
  onDelete?: (payload: {
    current: Todo;
  }) => Effect.Effect<DecodedEntity<Todo>, unknown>;
}) => {
  const memory = options.memory ?? Memory.make(syncStore);
  const net = network(options.online ?? true);
  const events: unknown[] = [];
  const std = createStdSync({
    name: 'outbox-test',
    outbox: true,
    platform: { storeLayer: memory.layer, connectivity: net.port },
    onEvent: (event) => Effect.sync(() => void events.push(event)),
  });
  const todos = std.collection({
    schema: todoSchema,
    onInsert:
      options.onInsert ??
      ((items) => Effect.succeed(items.map((item) => confirmed(item, '2')))),
    onUpdate:
      options.onUpdate ??
      (({ current, updates }) =>
        Effect.succeed(confirmed({ ...current, ...updates }, '3'))),
    onDelete:
      options.onDelete ??
      (({ current }) => Effect.succeed(confirmed(current, '4', true))),
  });
  return { std, todos, memory, net, events };
};

describe('outbox', () => {
  it('delivers an insert through the Drainer and drops the entry', async () => {
    const inserted: Todo[] = [];
    const { std, todos, memory } = setup({
      onInsert: (items) =>
        Effect.sync(() => {
          inserted.push(...items);
          return items.map((item) => confirmed(item, '2'));
        }),
    });
    await todos.preload();
    const tx = todos.insert({ id: 'a', title: 'A', done: false });
    await tx.isPersisted.promise;
    expect(inserted).toEqual([{ id: 'a', title: 'A', done: false }]);
    expect(todos.get('a')?._meta?._u).toBe('2');
    expect(await outboxEntries(memory, 'outbox-test')).toEqual([]);
    await std.dispose();
  });

  it('holds writes while offline and flies them when connectivity returns', async () => {
    const inserted: Todo[] = [];
    const { std, todos, memory, net } = setup({
      online: false,
      onInsert: (items) =>
        Effect.sync(() => {
          inserted.push(...items);
          return items.map((item) => confirmed(item, '2'));
        }),
    });
    await todos.preload();
    const tx = todos.insert({ id: 'a', title: 'A', done: false });
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory, 'outbox-test')).toHaveLength(1),
    );
    expect(inserted).toEqual([]);
    expect(todos.get('a')?.title).toBe('A');
    net.set(true);
    await tx.isPersisted.promise;
    expect(inserted).toHaveLength(1);
    await std.dispose();
  });

  it('folds rapid updates on one entity into one flight', async () => {
    const updates: unknown[] = [];
    const { std, todos, net } = setup({
      online: false,
      onUpdate: ({ current, updates: changes }) =>
        Effect.sync(() => {
          updates.push(changes);
          return confirmed({ ...current, ...changes }, '3');
        }),
    });
    await todos.preload();
    await Effect.runPromise(
      todos.utils.applyToSyncReplica(
        confirmed({ id: 'a', title: 'A', done: false }, '1'),
      ),
    );
    const first = todos.update('a', (draft) => {
      draft.title = 'B';
    });
    const second = todos.update('a', (draft) => {
      draft.done = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    net.set(true);
    await Promise.all([first.isPersisted.promise, second.isPersisted.promise]);
    expect(updates).toEqual([{ title: 'B', done: true }]);
    expect(todos.get('a')).toMatchObject({ title: 'B', done: true });
    await std.dispose();
  });

  it('rolls back a write the Backend rejects and keeps the failed entry', async () => {
    const { std, todos, memory, events } = setup({
      onInsert: () => Effect.fail(new Error('rejected')),
    });
    await todos.preload();
    const tx = todos.insert({ id: 'a', title: 'A', done: false });
    await expect(tx.isPersisted.promise).rejects.toBeDefined();
    expect(todos.has('a')).toBe(false);
    const entries = await outboxEntries(memory, 'outbox-test');
    expect(entries.map((entry) => entry.status)).toEqual(['failed']);
    expect(events).toContainEqual(
      expect.objectContaining({ _tag: 'OutboxFailed', phase: 'request' }),
    );
    await std.outbox.discard(entries[0]!.key);
    expect(await outboxEntries(memory, 'outbox-test')).toEqual([]);
    await std.dispose();
  });

  it('replays pending entries after a reload and delivers them', async () => {
    const memory = Memory.make(syncStore);
    const offline = setup({ memory, online: false });
    await offline.todos.preload();
    offline.todos.insert({ id: 'a', title: 'A', done: false });
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory, 'outbox-test')).toHaveLength(1),
    );
    await offline.std.dispose();

    const inserted: Todo[] = [];
    const reloaded = setup({
      memory,
      onInsert: (items) =>
        Effect.sync(() => {
          inserted.push(...items);
          return items.map((item) => confirmed(item, '2'));
        }),
    });
    await reloaded.todos.preload();
    await vi.waitFor(() =>
      expect(inserted).toEqual([{ id: 'a', title: 'A', done: false }]),
    );
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory, 'outbox-test')).toEqual([]),
    );
    expect(reloaded.todos.get('a')?._meta?._u).toBe('2');
    await reloaded.std.dispose();
  });

  it('shows persisted optimistic writes before preload resolves', async () => {
    const memory = Memory.make(syncStore);
    const offline = setup({ memory, online: false });
    await offline.todos.preload();
    offline.todos.insert({ id: 'a', title: 'A', done: false });
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory, 'outbox-test')).toHaveLength(1),
    );
    await offline.std.dispose();

    const reloaded = setup({ memory, online: false });
    await reloaded.todos.preload();
    expect(reloaded.todos.has('a')).toBe(true);
    await reloaded.std.dispose();
  });

  it('narrates enqueue, flight, and leadership inside the collection flow', async () => {
    const recorder = makeTraceRecorder();
    const runtime = {
      runSync: <A, E>(effect: Effect.Effect<A, E, never>) =>
        Effect.runSync(recorder.instrument(effect)),
      runPromise: <A, E>(effect: Effect.Effect<A, E, never>) =>
        Effect.runPromise(recorder.instrument(effect)),
    };
    const { inMemoryLeadership } =
      await import('../platform/leadership/in-memory/index.js');
    const net = network(false);
    const std = createStdSync({
      name: 'story',
      outbox: true,
      runtime,
      platform: {
        storeLayer: Memory.make(syncStore).layer,
        leadershipLayer: inMemoryLeadership(),
        connectivity: net.port,
      },
    });
    const todos = std.collection({
      schema: todoSchema,
      onInsert: (items) =>
        Effect.succeed(items.map((item) => confirmed(item, '2'))),
    });
    await todos.preload();
    const tx = todos.insert({ id: 'a', title: 'A', done: false });
    await vi.waitFor(() =>
      expect(
        recorder
          .snapshotFlows()[0]
          ?.items.some((item) => item.name === 'Enqueue'),
      ).toBe(true),
    );
    net.set(true);
    await tx.isPersisted.promise;
    await std.dispose();

    const flows = recorder.snapshotFlows();
    expect(flows).toHaveLength(1);
    const items = flows[0]!.items;
    const byParticipant = (participant: string) =>
      items
        .filter((item) => item.participantName === participant)
        .map((item) => item.name);
    expect(byParticipant('story/outbox')).toEqual(
      expect.arrayContaining([
        'Enqueue',
        'Back online',
        'Send Queue',
        'Delivered',
      ]),
    );
    expect(byParticipant('story/outbox/drainer')).toEqual(
      expect.arrayContaining(['Leadership acquired', 'Request', 'Delivered']),
    );
    expect(byParticipant('story/todo')).toContain('Queue 1 entry');
    const names = items.map((item) => item.name);
    expect(names.indexOf('Queue 1 entry')).toBeLessThan(
      names.indexOf('Enqueue'),
    );
    expect(flows[0]!.warnings).toEqual([]);
  });

  it("is byte-for-byte today's behavior when the outbox is off", async () => {
    const inserted: Todo[] = [];
    const std = createStdSync({ name: 'no-outbox' });
    const todos = std.collection({
      schema: todoSchema,
      onInsert: (items) =>
        Effect.sync(() => {
          inserted.push(...items);
          return items.map((item) => confirmed(item, '2'));
        }),
    });
    await todos.preload();
    await todos.insert({ id: 'a', title: 'A', done: false }).isPersisted
      .promise;
    expect(inserted).toHaveLength(1);
    expect(std.outbox.transaction('x')).toBeNull();
    await std.dispose();
  });
});

const fakeChannels = () => {
  const subscribers = new Map<string, Set<(message: unknown) => void>>();
  return (name: string) => ({
    broadcast: async (message: unknown) => {
      for (const handler of subscribers.get(name) ?? []) handler(message);
    },
    subscribe: async (handler: (message: unknown) => void) => {
      const set = subscribers.get(name) ?? new Set();
      set.add(handler);
      subscribers.set(name, set);
      return async () => {
        set.delete(handler);
      };
    },
  });
};

describe('outbox lifecycle', () => {
  it('reset wipes the store, rejects waiters, re-seeds, and keeps working', async () => {
    const { std, todos, memory, net } = setup({ online: false });
    await todos.preload();
    await Effect.runPromise(
      todos.utils.applyToSyncReplica(
        confirmed({ id: 'seed', title: 'S', done: false }, '1'),
      ),
    );
    const tx = todos.insert({ id: 'a', title: 'A', done: false });
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory, 'outbox-test')).toHaveLength(1),
    );
    await std.reset();
    await expect(tx.isPersisted.promise).rejects.toBeDefined();
    expect(await outboxEntries(memory, 'outbox-test')).toEqual([]);
    expect(todos.has('seed')).toBe(false);
    expect(todos.has('a')).toBe(false);
    net.set(true);
    await todos.insert({ id: 'b', title: 'B', done: false }).isPersisted
      .promise;
    expect(todos.get('b')?._meta?._u).toBe('2');
    await std.dispose();
  });

  it('delivers an offline action, in queue order, and replays it after a reload', async () => {
    const memory = Memory.make(syncStore);
    const flown: string[] = [];
    const build = (online: boolean) => {
      const base = setup({ memory, online });
      const archive = base.std.createOfflineAction({
        name: 'archive',
        payload: Schema.Struct({ id: Schema.String }),
        onMutate: ({ id }) => {
          if (base.todos.has(id))
            base.todos.update(id, (draft) => {
              draft.done = true;
            });
        },
        mutationFn: ({ id }) => Effect.sync(() => void flown.push(id)),
        queue: ({ id }) => id,
      });
      return { ...base, archive };
    };
    const offline = build(false);
    await offline.todos.preload();
    await Effect.runPromise(
      offline.todos.utils.applyToSyncReplica(
        confirmed({ id: 'a', title: 'A', done: false }, '1'),
      ),
    );
    const first = offline.archive({ id: 'a' });
    const second = offline.archive({ id: 'a' });
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory, 'outbox-test')).toHaveLength(2),
    );
    expect(offline.todos.get('a')?.done).toBe(true);
    expect(flown).toEqual([]);
    offline.net.set(true);
    await Promise.all([first.delivered, second.delivered]);
    expect(flown).toEqual(['a', 'a']);
    expect(await outboxEntries(memory, 'outbox-test')).toEqual([]);

    offline.net.set(false);
    offline.archive({ id: 'a' });
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory, 'outbox-test')).toHaveLength(1),
    );
    await offline.std.dispose();

    flown.length = 0;
    const reloaded = build(true);
    await vi.waitFor(() => expect(flown).toEqual(['a']));
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory, 'outbox-test')).toEqual([]),
    );
    await reloaded.std.dispose();
  });

  it('keeps an action pending after a reload until its name is registered', async () => {
    const memory = Memory.make(syncStore);
    const offline = setup({ memory, online: false });
    const ghost = offline.std.createOfflineAction({
      name: 'ghost',
      payload: Schema.Struct({}),
      onMutate: () => undefined,
      mutationFn: () => Effect.void,
    });
    ghost({});
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory, 'outbox-test')).toHaveLength(1),
    );
    await offline.std.dispose();
    const reloaded = setup({ memory });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      (await outboxEntries(memory, 'outbox-test')).map((entry) => entry.status),
    ).toEqual(['pending']);
    expect(reloaded.events).not.toContainEqual(
      expect.objectContaining({ _tag: 'OutboxFailed' }),
    );
    let restored = 0;
    reloaded.std.createOfflineAction({
      name: 'ghost',
      payload: Schema.Struct({}),
      onMutate: () => {
        restored += 1;
      },
      mutationFn: () => Effect.void,
    });
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory, 'outbox-test')).toEqual([]),
    );
    expect(restored).toBe(1);
    await reloaded.std.dispose();
  });

  it('knows the transaction of every entry in a batch while it waits', async () => {
    const { std, todos, memory } = setup({ online: false });
    await todos.preload();
    todos.insert([
      { id: 'a', title: 'A', done: false },
      { id: 'b', title: 'B', done: false },
    ]);
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory, 'outbox-test')).toHaveLength(2),
    );
    const entries = await outboxEntries(memory, 'outbox-test');
    for (const entry of entries) {
      expect(std.outbox.transaction(entry.key)).not.toBeNull();
    }
    await std.dispose();
  });

  it('rejects a duplicate action name synchronously, before and after ready', async () => {
    const { std, todos } = setup({});
    const define = () =>
      std.createOfflineAction({
        name: 'twice',
        payload: Schema.Struct({}),
        onMutate: () => undefined,
        mutationFn: () => Effect.void,
      });
    define();
    expect(define).toThrow('already registered');
    await todos.preload();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(define).toThrow('already registered');
    await std.dispose();
  });

  it("resolves a non-leader tab's waiter when the leader delivers and rings", async () => {
    const { inMemoryLeadership } =
      await import('../platform/leadership/in-memory/index.js');
    const memory = Memory.make(syncStore);
    const leadershipLayer = inMemoryLeadership();
    const channel = fakeChannels();
    const inserted: string[] = [];
    const tab = (label: string) => {
      const std = createStdSync({
        name: 'tabs',
        outbox: true,
        platform: {
          storeLayer: memory.layer,
          leadershipLayer,
          peerSync: { channel },
        },
      });
      const todos = std.collection({
        schema: todoSchema,
        onInsert: (items) =>
          Effect.sync(() => {
            inserted.push(label);
            return items.map((item) => confirmed(item, '2'));
          }),
      });
      return { std, todos };
    };
    const leader = tab('leader');
    await leader.todos.preload();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const follower = tab('follower');
    await follower.todos.preload();
    const tx = follower.todos.insert({ id: 'a', title: 'A', done: false });
    await tx.isPersisted.promise;
    expect(inserted).toEqual(['leader']);
    await vi.waitFor(() => expect(leader.todos.get('a')?._meta?._u).toBe('2'));
    await follower.std.dispose();
    await leader.std.dispose();
  });
});
