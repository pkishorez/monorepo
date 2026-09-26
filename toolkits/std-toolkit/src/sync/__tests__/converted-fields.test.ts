import { Effect, Schema } from 'effect';
import { EntitySchema } from '../../core/index.js';
import { makeSyncStateStore } from '../strategy/state/index.js';
import { describe, expect, it, vi } from 'vitest';
import type { Entity } from '../../core/index.js';
import { EntityESchema } from '../../eschema/index.js';
import { Memory } from '../../db/memory/index.js';
import {
  createStdSync,
  syncStore,
  type Connectivity,
  type PeerChannelFactory,
  type SyncStoreLayer,
} from '../std-sync/std-sync.js';
import {
  storedOutboxEntryEntity,
  storedReplicaEntity,
  storedSyncStateEntity,
} from '../domain/stored-entity/index.js';
import {
  oldToNewStateSchema,
  type OldToNewState,
} from '../strategy/strategy/old-to-new/state.js';
import type { StateEntitySchema } from '../strategy/state/index.js';

type Task = { id: string; title: string; dueAt: Date };

const taskSchema = EntityESchema.make('Task', 'id', {
  title: Schema.String,
  dueAt: Schema.DateFromString,
}).build();

const MAY = '2026-05-01T09:00:00.000Z';
const JUNE = '2026-06-01T09:00:00.000Z';

const task = (dueAt: string, title = 'Ship'): Task => ({
  id: 'a',
  title,
  dueAt: new Date(dueAt),
});

const confirmed = (value: Task, u: string): Entity<Task> => ({
  value,
  meta: { _e: 'Task', _v: 'v1', _d: false, _u: u },
});

const offline = (): Connectivity => ({
  isOnline: () => false,
  subscribe: () => () => undefined,
});

const readAll = <A>(
  memory: { layer: SyncStoreLayer },
  query: Effect.Effect<{ items: ReadonlyArray<{ value: A }> }, unknown, never>,
) =>
  Effect.runPromise(
    query.pipe(
      Effect.provide(memory.layer),
      Effect.map((page) => page.items.map((item) => item.value)),
    ) as Effect.Effect<A[]>,
  );

const outboxEntries = (memory: { layer: SyncStoreLayer }) =>
  readAll(
    memory,
    storedOutboxEntryEntity.query('primary', {
      pk: { sync: 'dates' },
      '>=': null,
    }) as never,
  ) as Promise<Array<{ body: { after: Record<string, unknown> } }>>;

const setup = (options: {
  memory: { layer: SyncStoreLayer };
  online: boolean;
  onInsert?: (items: ReadonlyArray<Task>) => void;
  onUpdate?: (payload: { current: Task; updates: Partial<Task> }) => void;
}) => {
  const std = createStdSync({
    name: 'dates',
    outbox: true,
    platform: {
      storeLayer: options.memory.layer,
      ...(options.online ? {} : { connectivity: offline() }),
    },
  });
  const tasks = std.collection({
    schema: taskSchema,
    onInsert: (items) =>
      Effect.sync(() => {
        options.onInsert?.(items);
        return items.map((item) => confirmed(item, '2'));
      }),
    onUpdate: (payload) =>
      Effect.sync(() => {
        options.onUpdate?.(payload);
        return confirmed({ ...payload.current, ...payload.updates }, '3');
      }),
    onDelete: ({ current }) =>
      Effect.succeed({
        ...confirmed(current, '4'),
        meta: { ...confirmed(current, '4').meta, _d: true },
      }),
  });
  return { std, tasks };
};

describe('converted fields', () => {
  it('shows Dates in rows and keeps the Sync Replica encoded', async () => {
    const memory = Memory.make(syncStore);
    const { std, tasks } = setup({ memory, online: true });
    await tasks.preload();
    await Effect.runPromise(
      tasks.utils.applyToSyncReplica(confirmed(task(MAY), '1')),
    );

    expect(tasks.get('a')?.dueAt).toEqual(new Date(MAY));
    const stored = await readAll(
      memory,
      storedReplicaEntity.query('primary', {
        pk: { collection: 'dates.task' },
        '>=': null,
      }) as never,
    );
    expect(stored).toHaveLength(1);
    expect(
      (stored[0] as { entity: { value: { dueAt: unknown } } }).entity.value
        .dueAt,
    ).toBe(MAY);
    await std.dispose();
  });

  it('queues an encoded insert and replays it with Dates after a reload', async () => {
    const memory = Memory.make(syncStore);
    const first = setup({ memory, online: false });
    await first.tasks.preload();
    first.tasks.insert(task(MAY));
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory)).toHaveLength(1),
    );
    const [entry] = await outboxEntries(memory);
    expect(entry!.body.after).toEqual({
      _v: 'v1',
      id: 'a',
      title: 'Ship',
      dueAt: MAY,
    });
    await first.std.dispose();

    const inserted: Task[] = [];
    const reloaded = setup({
      memory,
      online: true,
      onInsert: (items) => inserted.push(...items),
    });
    await reloaded.tasks.preload();
    await vi.waitFor(() => expect(inserted).toEqual([task(MAY)]));
    expect(inserted[0]!.dueAt).toBeInstanceOf(Date);
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory)).toEqual([]),
    );
    expect(reloaded.tasks.get('a')?.dueAt).toEqual(new Date(MAY));
    await reloaded.std.dispose();
  });

  it('queues an encoded update and replays only its changed Date field', async () => {
    const memory = Memory.make(syncStore);
    const first = setup({ memory, online: false });
    await first.tasks.preload();
    await Effect.runPromise(
      first.tasks.utils.applyToSyncReplica(confirmed(task(MAY), '1')),
    );
    first.tasks.update('a', (draft) => {
      draft.dueAt = new Date(JUNE);
    });
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory)).toHaveLength(1),
    );
    const [entry] = await outboxEntries(memory);
    expect(entry!.body).toMatchObject({
      op: 'update',
      base: { _v: 'v1', dueAt: MAY },
      after: { _v: 'v1', dueAt: JUNE },
      changed: ['dueAt'],
    });
    await first.std.dispose();

    const updates: Array<{ current: Task; updates: Partial<Task> }> = [];
    const reloaded = setup({
      memory,
      online: false,
      onUpdate: (payload) => updates.push(payload),
    });
    await reloaded.tasks.preload();
    expect(reloaded.tasks.get('a')?.dueAt).toEqual(new Date(JUNE));
    await reloaded.std.dispose();

    const online = setup({
      memory,
      online: true,
      onUpdate: (payload) => updates.push(payload),
    });
    await online.tasks.preload();
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      current: task(MAY),
      updates: { dueAt: new Date(JUNE) },
    });
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory)).toEqual([]),
    );
    await online.std.dispose();
  });

  it('sends a folded delete-then-insert as an update of values only', async () => {
    const memory = Memory.make(syncStore);
    const first = setup({ memory, online: false });
    await first.tasks.preload();
    await Effect.runPromise(
      first.tasks.utils.applyToSyncReplica(confirmed(task(MAY), '1')),
    );
    first.tasks.delete('a');
    first.tasks.insert(task(JUNE, 'Again'));
    await vi.waitFor(async () =>
      expect(await outboxEntries(memory)).toHaveLength(2),
    );
    await first.std.dispose();

    const updates: Array<{ current: Task; updates: Partial<Task> }> = [];
    const online = setup({
      memory,
      online: true,
      onUpdate: (payload) => updates.push(payload),
    });
    await online.tasks.preload();
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      current: task(MAY),
      updates: { title: 'Again', dueAt: new Date(JUNE) },
    });
    expect(Object.keys(updates[0]!.updates).sort()).toEqual(['dueAt', 'title']);
    await online.std.dispose();
  });

  it('delivers Dates through Peer Sync over an encoded message', async () => {
    const handlers = new Set<(message: unknown) => void>();
    const messages: unknown[] = [];
    const channel: PeerChannelFactory = () => {
      let own: ((message: unknown) => void) | null = null;
      return {
        broadcast: async (message) => {
          messages.push(message);
          for (const handler of handlers) if (handler !== own) handler(message);
        },
        subscribe: async (handler) => {
          own = handler;
          handlers.add(handler);
          return async () => void handlers.delete(handler);
        },
      };
    };
    const tab = () => {
      const std = createStdSync({
        name: 'peers',
        platform: { peerSync: { channel } },
      });
      return { std, tasks: std.collection({ schema: taskSchema }) };
    };
    const first = tab();
    const second = tab();
    await first.tasks.preload();
    await second.tasks.preload();
    await vi.waitFor(() => expect(handlers.size).toBe(2));

    await Effect.runPromise(
      first.tasks.utils.applyToSyncReplica(confirmed(task(MAY), '1')),
    );
    await vi.waitFor(() =>
      expect(second.tasks.get('a')?.dueAt).toEqual(new Date(MAY)),
    );
    expect(messages).toEqual([
      {
        version: 1,
        entities: [
          expect.objectContaining({
            value: { id: 'a', title: 'Ship', dueAt: MAY },
          }),
        ],
      },
    ]);
    await first.std.dispose();
    await second.std.dispose();
  });

  it('round-trips a Sync State cursor holding a Date', async () => {
    const memory = Memory.make(syncStore);
    const observed: unknown[] = [];
    const run = (
      strategy: (ctx: {
        getState: Effect.Effect<OldToNewState, unknown>;
        setState: (state: OldToNewState) => Effect.Effect<void, unknown>;
      }) => Effect.Effect<void, unknown>,
    ) => {
      const std = createStdSync({
        name: 'cursor',
        platform: { storeLayer: memory.layer },
      });
      const tasks = std.collection({
        schema: taskSchema,
        sync: {
          total: {
            strategy: {
              name: 'test/cursor',
              state: {
                schema: oldToNewStateSchema,
                empty: { cursor: null },
              },
              run: strategy,
            },
          },
        },
      });
      return { std, tasks };
    };

    const saved = { done: false };
    const first = run((ctx) =>
      ctx
        .setState({ cursor: confirmed(task(MAY), '1') })
        .pipe(Effect.tap(() => Effect.sync(() => (saved.done = true)))),
    );
    await first.tasks.preload();
    await vi.waitFor(() => expect(saved.done).toBe(true));
    const stored = await readAll(
      memory,
      storedSyncStateEntity.query('primary', {
        pk: { collection: 'cursor.task' },
        '>=': null,
      }) as never,
    );
    expect(stored).toEqual([
      expect.objectContaining({
        value: {
          cursor: expect.objectContaining({
            value: { id: 'a', title: 'Ship', dueAt: MAY },
          }),
        },
      }),
    ]);
    await first.std.dispose();

    const second = run((ctx) =>
      ctx.getState.pipe(
        Effect.tap((state) => Effect.sync(() => observed.push(state))),
        Effect.asVoid,
      ),
    );
    await second.tasks.preload();
    await vi.waitFor(() => expect(observed).toHaveLength(1));
    expect(observed[0]).toEqual({
      cursor: expect.objectContaining({ value: task(MAY) }),
    });
    await second.std.dispose();
  });

  it('round-trips a strategy state that holds its own Date', async () => {
    const memory = Memory.make(syncStore);
    const stateSchema = (entity: StateEntitySchema) =>
      Schema.Struct({
        since: Schema.DateFromString,
        cursor: Schema.NullOr(entity),
      });
    type State = ReturnType<typeof stateSchema>['Type'];
    const observed: State[] = [];
    const run = (
      strategy: (ctx: {
        getState: Effect.Effect<State, unknown>;
        setState: (state: State) => Effect.Effect<void, unknown>;
      }) => Effect.Effect<void, unknown>,
    ) => {
      const std = createStdSync({
        name: 'since',
        platform: { storeLayer: memory.layer },
      });
      const tasks = std.collection({
        schema: taskSchema,
        sync: {
          total: {
            strategy: {
              name: 'test/since',
              state: {
                schema: stateSchema,
                empty: { since: new Date(0), cursor: null },
              },
              run: strategy,
            },
          },
        },
      });
      return { std, tasks };
    };

    const saved = { done: false };
    const first = run((ctx) =>
      ctx
        .setState({
          since: new Date(JUNE),
          cursor: confirmed(task(MAY), '1'),
        })
        .pipe(Effect.tap(() => Effect.sync(() => (saved.done = true)))),
    );
    await first.tasks.preload();
    await vi.waitFor(() => expect(saved.done).toBe(true));
    const stored = await readAll(
      memory,
      storedSyncStateEntity.query('primary', {
        pk: { collection: 'since.task' },
        '>=': null,
      }) as never,
    );
    expect(stored).toEqual([
      expect.objectContaining({
        value: {
          since: JUNE,
          cursor: expect.objectContaining({
            value: { id: 'a', title: 'Ship', dueAt: MAY },
          }),
        },
      }),
    ]);
    await first.std.dispose();

    const second = run((ctx) =>
      ctx.getState.pipe(
        Effect.tap((state) => Effect.sync(() => observed.push(state))),
        Effect.asVoid,
      ),
    );
    await second.tasks.preload();
    await vi.waitFor(() => expect(observed).toHaveLength(1));
    expect(observed[0]?.since).toEqual(new Date(JUNE));
    expect(observed[0]?.cursor).toEqual(
      expect.objectContaining({ value: task(MAY) }),
    );
    await second.std.dispose();
  });

  describe('Sync State store', () => {
    const stateStore = <S>(
      memory: { layer: SyncStoreLayer },
      schema: Schema.Codec<S, unknown, never, never>,
      empty: S,
    ) =>
      makeSyncStateStore({
        schema: taskSchema,
        schemaName: 'task',
        strategyName: 's',
        store: {
          provide: (effect: Effect.Effect<any, any, any>) =>
            effect.pipe(Effect.provide(memory.layer)),
        } as never,
        state: { schema: () => schema, empty },
      });
    const run = <A>(effect: Effect.Effect<A, unknown, any>) =>
      Effect.runPromise(effect as Effect.Effect<A>);
    const storedState = (memory: { layer: SyncStoreLayer }) =>
      run(
        storedSyncStateEntity
          .get({ collection: 'task', key: 'k' })
          .pipe(Effect.provide(memory.layer)),
      ).then((stored) => stored?.value.value);

    it('encodes an Entity once when the state schema holds its codec', async () => {
      const memory = Memory.make(syncStore);
      const store = stateStore(
        memory,
        Schema.Struct({ cursor: Schema.NullOr(EntitySchema(taskSchema)) }),
        { cursor: null },
      );
      const cursor = confirmed(task(MAY), '1');

      await run(store.set('k', { cursor }));
      expect(await storedState(memory)).toEqual({
        cursor: expect.objectContaining({
          value: { id: 'a', title: 'Ship', dueAt: MAY },
        }),
      });
      expect(await run(store.get('k'))).toEqual({ cursor });
    });

    it('stores a reset state encoded, so the next read keeps it', async () => {
      const memory = Memory.make(syncStore);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const store = stateStore(
        memory,
        Schema.Struct({ since: Schema.DateFromString }),
        { since: new Date(0) },
      );
      await run(
        storedSyncStateEntity
          .insert({
            collection: 'task',
            key: 'k',
            strategy: 's',
            value: { since: 'not a date' },
          })
          .pipe(Effect.provide(memory.layer)),
      );

      expect(await run(store.get('k'))).toEqual({ since: new Date(0) });
      expect(await storedState(memory)).toEqual({
        since: '1970-01-01T00:00:00.000Z',
      });
      // A second reset would rewrite the row and move its `_u`.
      const storedU = () =>
        run(
          storedSyncStateEntity
            .get({ collection: 'task', key: 'k' })
            .pipe(Effect.provide(memory.layer)),
        ).then((stored) => stored?.meta._u);
      const before = await storedU();
      expect(await run(store.get('k'))).toEqual({ since: new Date(0) });
      expect(await storedU()).toBe(before);
      warn.mockRestore();
    });
  });
});
