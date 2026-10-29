import { Effect, Schema, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { Memory } from '../../memory/index.js';
import {
  contractLayer,
  OperationFailure,
  StdTableService,
  type ConditionalPut,
  type QueryRequest,
  type ReadOptions,
  type ScanRequest,
  type StdTableContract,
  type StoredItem,
} from '../../std-table/contract/index.js';
import { DatabaseError } from '../../std-table/error/index.js';
import { encodeCompositeKey } from '../../std-table/key/index.js';
import { StdTable } from '../../std-table/table/index.js';
import { isOutdatedCode, runSetup, SetupRefused } from '../index.js';
import * as setupDoor from '../index.js';

const NAME = 'board';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
}).build();
const TaskV2 = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { done: Schema.Boolean }, (v1) => ({ ...v1, done: false }))
  .build();
// A pure v2 that lowercases the indexed title: every change is safe, yet the
// stored index keys are stale until setup reindexes.
const LowerTitle = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { done: Schema.Boolean }, (v1) => ({
    ...v1,
    title: v1.title.toLowerCase(),
    done: false,
  }))
  .build();

const v1Table = () =>
  StdTable.make(NAME)
    .primary('pk', 'sk')
    .entity(TaskV1, (e) => e.primary({ pk: ['projectId'] }))
    .build();

const v2Table = () =>
  StdTable.make(NAME)
    .primary('pk', 'sk')
    .entity(TaskV2, (e) => e.primary({ pk: ['projectId'] }))
    .build();

/**
 * Task found by title, on a new global secondary index. A later Task is
 * typed as v1: only its runtime versions matter here.
 */
const byTitle = (Task: typeof TaskV1 | typeof TaskV2 | typeof LowerTitle) =>
  StdTable.make(NAME)
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .entity(Task as typeof TaskV1, (e) =>
      e
        .primary({ pk: ['projectId'] })
        .index('GSI1', 'byTitle', { pk: ['title'] }),
    )
    .build();

const indexed = () => byTitle(TaskV1);

/** A Memory table's StdTable contract, with every call counted. */
const memoryStore = (
  options: {
    readonly failWrite?: (
      kind: 'write' | 'transact',
      items: readonly StoredItem[],
    ) => boolean;
    /** Runs before each single write, on the store underneath. */
    readonly beforeWrite?: (
      put: ConditionalPut,
      inner: StdTableContract,
    ) => Effect.Effect<void>;
  } = {},
) => {
  // The widest topology any test declares, so every index can be queried.
  const layer = Memory.make(indexed()).layer;
  const inner = Effect.runSync(
    Effect.map(StdTableService(NAME), ({ contract }) => contract).pipe(
      Effect.provide(layer),
    ),
  );
  const queries: QueryRequest[] = [];
  const scans: ScanRequest[] = [];
  const gets: (ReadOptions | undefined)[] = [];
  const counts = {
    getItem: 0,
    queryItems: 0,
    scanItems: 0,
    writes: [] as StoredItem[],
  };
  const store: StdTableContract = {
    ...inner,
    getItem: (key, read) => (
      counts.getItem++,
      gets.push(read),
      inner.getItem(key, read)
    ),
    queryItems: (request) => (
      counts.queryItems++,
      queries.push(request),
      inner.queryItems(request)
    ),
    scanItems: (request) => (
      counts.scanItems++,
      scans.push(request),
      inner.scanItems(request)
    ),
    writeItem: (put) => {
      if (options.failWrite?.('write', [put.item]))
        return Effect.fail(new OperationFailure({ cause: 'injected' }));
      counts.writes.push(put.item);
      return Effect.andThen(
        options.beforeWrite?.(put, inner) ?? Effect.void,
        inner.writeItem(put),
      );
    },
    transactWriteItems: (items) => {
      const puts = items.flatMap((item) =>
        item.kind === 'put' ? [item.item] : [],
      );
      if (options.failWrite?.('transact', puts))
        return Effect.fail(new OperationFailure({ cause: 'injected' }));
      counts.writes.push(...puts);
      return inner.transactWriteItems(items);
    },
  };
  const reset = () => {
    queries.length = 0;
    scans.length = 0;
    gets.length = 0;
    counts.getItem = 0;
    counts.queryItems = 0;
    counts.scanItems = 0;
    counts.writes = [];
  };
  return {
    store,
    counts,
    queries,
    scans,
    gets,
    reset,
    layer: contractLayer(NAME, store),
  };
};

const run = <A, E>(
  effect: Effect.Effect<A, E, StdTableService<typeof NAME>>,
  layer: ReturnType<typeof memoryStore>['layer'],
) => Effect.runPromise(effect.pipe(Effect.provide(layer)));

const fails = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.flip(effect));

const allItems = (store: StdTableContract) =>
  Effect.runPromise(
    Effect.map(store.scanItems({ limit: 1000 }), ({ items }) => items),
  );

const contractRow = async (store: StdTableContract, ...sk: string[]) =>
  Effect.runPromise(
    store.getItem({
      pk: encodeCompositeKey(['_std_contract']),
      sk: encodeCompositeKey(sk),
    }),
  );

const insertV1 = (taskIds: readonly string[]) =>
  Effect.forEach(
    taskIds,
    (taskId) =>
      v1Table().Task.insert({ taskId, projectId: 'p1', title: `T ${taskId}` }),
    { discard: true },
  );

const tasksOf = (items: readonly StoredItem[]) =>
  items.filter(({ meta }) => meta._e === 'Task');

/** The ids of the tasks the byTitle index finds under `title`. */
const titled = (
  table: ReturnType<typeof indexed>,
  title: string,
  layer: ReturnType<typeof memoryStore>['layer'],
) =>
  run(
    Effect.map(
      table.Task.query('byTitle', { pk: { title }, '>=': null }),
      ({ items }) => items.map(({ value }) => value.taskId),
    ),
    layer,
  );

/** A persistent table set up at v1 and holding `taskIds`. */
const atV1 = async (
  taskIds: readonly string[],
  options?: Parameters<typeof memoryStore>[0],
) => {
  const memory = memoryStore(options);
  await Effect.runPromise(
    runSetup({ table: v1Table(), mode: 'persistent', store: memory.store }),
  );
  await run(insertV1(taskIds), memory.layer);
  memory.reset();
  return memory;
};

describe('runSetup', () => {
  it('records a fresh empty table, scanning one page', async () => {
    const { store, counts } = memoryStore();
    const outcome = await Effect.runPromise(
      runSetup({ table: indexed(), mode: 'persistent', store }),
    );
    expect(outcome).toEqual({ kind: 'created' });
    // One page to see the table is empty; nothing to reindex.
    expect(counts.scanItems).toBe(1);
  });

  it('refuses a persistent table that holds rows but no contract', async () => {
    const { store, layer } = memoryStore();
    await run(insertV1(['t1']), layer);
    const refused = await fails(
      runSetup({ table: v1Table(), mode: 'persistent', store }),
    );
    expect(refused).toBeInstanceOf(SetupRefused);
    expect((refused as SetupRefused).reason).toBe('no-contract');
    expect((refused as SetupRefused).message).toMatch(
      /Use a new physical table name, or delete the data/,
    );
    expect(tasksOf(await allItems(store))).toHaveLength(1);
  });

  it('wipes a disposable table that holds rows but no contract', async () => {
    const { store, layer } = memoryStore();
    await run(insertV1(['t1']), layer);
    const outcome = await Effect.runPromise(
      runSetup({ table: v1Table(), mode: 'disposable', store }),
    );
    expect(outcome.kind).toBe('wiped');
    expect(tasksOf(await allItems(store))).toHaveLength(0);
  });

  it('reads one row for an unchanged table', async () => {
    const { store, counts } = await atV1(['t1']);
    const outcome = await Effect.runPromise(
      runSetup({ table: v1Table(), mode: 'persistent', store }),
    );
    expect(outcome).toEqual({ kind: 'unchanged' });
    expect(counts).toEqual({
      getItem: 1,
      queryItems: 0,
      scanItems: 0,
      writes: [],
    });
  });

  it('refuses a page size that cannot hold a row, before changing anything', async () => {
    const { store } = await atV1(['t1']);
    const before = await allItems(store);
    for (const pageSize of [0, -1, 1.5]) {
      const exit = await Effect.runPromiseExit(
        runSetup({ table: indexed(), mode: 'persistent', store, pageSize }),
      );
      expect(exit._tag).toBe('Failure');
    }
    expect(await allItems(store)).toEqual(before);
  });

  it('keeps reserved rows out of scan and entity reads', async () => {
    const { store, layer } = await atV1(['t1']);
    const table = v1Table();
    expect((await allItems(store)).length).toBeGreaterThan(1);
    const scanned = await run(Stream.runCollect(table.scan()), layer);
    expect(Array.from(scanned).map(({ meta }) => meta._e)).toEqual(['Task']);
    const queried = await run(
      table.Task.query('primary', { pk: { projectId: 'p1' }, '>=': null }),
      layer,
    );
    expect(queried.items.map(({ value }) => value.taskId)).toEqual(['t1']);
    expect(() =>
      StdTable.make(NAME)
        .primary('pk', 'sk')
        .entity(
          EntityESchema.make('_std_table', 'id', { a: Schema.String }).build(),
          (e) => e.primary(),
        ),
    ).toThrow(/reserved/);
  });

  it('never rewrites a version row', async () => {
    const { store } = await atV1(['t1']);
    const v1Row = await contractRow(store, 'version', 'Task', 'v1', '1');
    expect(v1Row?.data).toMatchObject({ identity: 'Task', version: 'v1' });
    await Effect.runPromise(
      runSetup({ table: v2Table(), mode: 'persistent', store }),
    );
    expect(await contractRow(store, 'version', 'Task', 'v1', '1')).toEqual(
      v1Row,
    );
    expect(
      await contractRow(store, 'version', 'Task', 'v2', '2'),
    ).not.toBeNull();
  });

  it('refuses a breaking change on a persistent table, pointing to a new table', async () => {
    const { store } = await atV1(['t1']);
    const edited = StdTable.make(NAME)
      .primary('pk', 'sk')
      .entity(
        EntityESchema.make('Task', 'taskId', {
          projectId: Schema.String,
          title: Schema.Finite,
        }).build(),
        (e) => e.primary({ pk: ['projectId'] }),
      )
      .build();
    const refused = await fails(
      runSetup({ table: edited, mode: 'persistent', store }),
    );
    expect(refused).toMatchObject({ reason: 'breaking' });
    expect((refused as SetupRefused).message).toMatch(
      /add the change as a new version with a migration\. A change no migration can make needs a new physical table, and a table migration/,
    );
    expect((refused as SetupRefused).message).not.toMatch(/Backfill/);
  });

  describe('reindex', () => {
    it('reindexes existing rows into an added index, so they are found by it', async () => {
      const { store, layer, scans } = await atV1(['t1', 't2', 't3']);
      const table = indexed();
      const outcome = await Effect.runPromise(
        runSetup({ table, mode: 'persistent', store, pageSize: 2 }),
      );
      expect(outcome).toMatchObject({ kind: 'applied', reindexed: ['Task'] });
      // Strongly consistent, page by page.
      expect(scans.length).toBeGreaterThan(1);
      expect(scans.every(({ consistent }) => consistent === true)).toBe(true);
      expect(await titled(table, 'T t2', layer)).toEqual(['t2']);
      for (const item of tasksOf(await allItems(store)))
        expect(Object.keys(item.keys)).toContain('GSI1PK');
    });

    it('finds the next setup unchanged, rewriting nothing', async () => {
      const { store, counts, reset } = await atV1(['t1']);
      await Effect.runPromise(
        runSetup({ table: indexed(), mode: 'persistent', store }),
      );
      reset();
      expect(
        await Effect.runPromise(
          runSetup({ table: indexed(), mode: 'persistent', store }),
        ),
      ).toEqual({ kind: 'unchanged' });
      expect(counts.writes).toEqual([]);
    });

    it('rewrites only rows whose index keys drifted', async () => {
      const { store, layer, counts, reset } = await atV1([]);
      await Effect.runPromise(
        runSetup({ table: indexed(), mode: 'persistent', store }),
      );
      await run(
        indexed().Task.insert({ taskId: 't1', projectId: 'p1', title: 'One' }),
        layer,
      );
      reset();
      // A pure new version with an indexed entity is checked, and t1's keys
      // are current already.
      const outcome = await Effect.runPromise(
        runSetup({
          table: byTitle(TaskV2),
          mode: 'persistent',
          store,
        }),
      );
      expect(outcome).toMatchObject({ kind: 'applied', reindexed: ['Task'] });
      expect(tasksOf(counts.writes)).toEqual([]);
    });

    it('reindexes rows a migration moves to another index key', async () => {
      const { store, layer } = await atV1([]);
      const before = indexed();
      await Effect.runPromise(
        runSetup({ table: before, mode: 'persistent', store }),
      );
      await run(
        before.Task.insert({ taskId: 't1', projectId: 'p1', title: 'Hello' }),
        layer,
      );
      const after = byTitle(LowerTitle);
      expect(
        await Effect.runPromise(
          runSetup({ table: after, mode: 'persistent', store }),
        ),
      ).toMatchObject({ kind: 'applied', reindexed: ['Task'] });
      expect(await titled(after, 'hello', layer)).toEqual(['t1']);
      expect(await titled(after, 'Hello', layer)).toEqual([]);
      // Only the keys moved: the row is still stored at v1, as old code
      // still serving reads it.
      const [task] = tasksOf(await allItems(store));
      expect(task?.data).toMatchObject({ _v: 'v1', title: 'Hello' });
      expect(
        await run(before.Task.get({ projectId: 'p1', taskId: 't1' }), layer),
      ).toMatchObject({ value: { title: 'Hello' } });
    });

    it('does not reindex an entity no index change touches', async () => {
      const { store, counts } = await atV1(['t1']);
      const outcome = await Effect.runPromise(
        runSetup({ table: v2Table(), mode: 'persistent', store }),
      );
      expect(outcome).toMatchObject({ kind: 'applied', reindexed: [] });
      expect(tasksOf(counts.writes)).toEqual([]);
    });

    it('wipes a disposable table instead of reindexing it', async () => {
      const memory = memoryStore();
      await Effect.runPromise(
        runSetup({ table: v1Table(), mode: 'disposable', store: memory.store }),
      );
      await run(insertV1(['t1']), memory.layer);
      const outcome = await Effect.runPromise(
        runSetup({ table: indexed(), mode: 'disposable', store: memory.store }),
      );
      expect(outcome.kind).toBe('wiped');
      expect(tasksOf(await allItems(memory.store))).toHaveLength(0);
    });

    it('reindexes again after a crash part-way, and then records the contract', async () => {
      let armed = false;
      let taskWrites = 0;
      const { store, layer } = await atV1(['t1', 't2', 't3', 't4'], {
        failWrite: (kind, items) =>
          armed &&
          kind === 'write' &&
          items[0]?.meta._e === 'Task' &&
          ++taskWrites === 3,
      });
      const table = indexed();
      armed = true;
      expect(
        await fails(runSetup({ table, mode: 'persistent', store })),
      ).toMatchObject({ reason: { _tag: 'OperationFailed' } });
      // Two rows were rewritten; the contract is still the old one.
      expect(
        tasksOf(await allItems(store)).filter(({ keys }) => 'GSI1PK' in keys),
      ).toHaveLength(2);
      armed = false;
      expect(
        await Effect.runPromise(runSetup({ table, mode: 'persistent', store })),
      ).toMatchObject({ kind: 'applied', reindexed: ['Task'] });
      for (const taskId of ['t1', 't2', 't3', 't4'])
        expect(await titled(table, `T ${taskId}`, layer)).toEqual([taskId]);
      expect(
        await Effect.runPromise(runSetup({ table, mode: 'persistent', store })),
      ).toEqual({ kind: 'unchanged' });
    });

    // An app write between the scan's read and the reindex write: old code,
    // so the row it writes has no key for the new index.
    const appRenames = (title: string, times = Infinity) => {
      let renamed = 0;
      return {
        renamed: () => renamed,
        beforeWrite: (put: ConditionalPut, inner: StdTableContract) =>
          put.item.meta._e === 'Task' &&
          put.condition?.kind === 'updated' &&
          renamed < times
            ? Effect.gen(function* () {
                const stored = (yield* Effect.orDie(inner.getItem(put.item)))!;
                renamed++;
                yield* Effect.orDie(
                  inner.writeItem({
                    item: {
                      ...stored,
                      meta: {
                        ...stored.meta,
                        _u: `${stored.meta._u}${renamed}`,
                      },
                      data: { ...stored.data, title },
                    },
                  }),
                );
              })
            : Effect.void,
      };
    };

    it('reads a row again when an app write moved it, keeping the new value', async () => {
      const rename = appRenames('Renamed', 1);
      const { store, layer } = await atV1(['t1'], {
        beforeWrite: rename.beforeWrite,
      });
      const table = indexed();
      expect(
        await Effect.runPromise(runSetup({ table, mode: 'persistent', store })),
      ).toMatchObject({ kind: 'applied' });
      expect(rename.renamed()).toBe(1);
      expect(await titled(table, 'Renamed', layer)).toEqual(['t1']);
      expect(await titled(table, 'T t1', layer)).toEqual([]);
    });

    it('fails, leaving the contract, when a row keeps moving', async () => {
      const rename = appRenames('Again');
      const { store } = await atV1(['t1'], { beforeWrite: rename.beforeWrite });
      const failed = await fails(
        runSetup({ table: indexed(), mode: 'persistent', store }),
      );
      expect(failed).toBeInstanceOf(DatabaseError);
      expect((failed as DatabaseError).reason._tag).toBe('ReindexConflict');
      expect(rename.renamed()).toBe(3);
      expect((await contractRow(store, 'table'))?.data).not.toHaveProperty(
        'topology.globalSecondaryIndexes.0',
      );
    });

    it('fails on a row it cannot read, leaving the contract', async () => {
      const { store } = await atV1(['t1']);
      const [task] = tasksOf(await allItems(store));
      await Effect.runPromise(
        store.writeItem({
          item: { ...task!, data: { ...task!.data, title: 42 } as never },
        }),
      );
      const failed = await fails(
        runSetup({ table: indexed(), mode: 'persistent', store }),
      );
      expect(failed).toBeInstanceOf(DatabaseError);
      expect(
        await Effect.runPromise(
          runSetup({ table: v1Table(), mode: 'persistent', store }),
        ),
      ).toEqual({ kind: 'unchanged' });
    });
  });

  describe('regressions', () => {
    it('keeps the latest accepted checks of a version as its baseline', async () => {
      const table = (minimum: number) =>
        StdTable.make(NAME)
          .primary('pk', 'sk')
          .entity(
            EntityESchema.make('Task', 'taskId', {
              projectId: Schema.String,
              title: Schema.String.check(Schema.isMinLength(minimum)),
            }).build(),
            (e) => e.primary({ pk: ['projectId'] }),
          )
          .build();
      const { store, layer } = memoryStore();
      await Effect.runPromise(
        runSetup({ table: table(5), mode: 'persistent', store }),
      );
      expect(
        await Effect.runPromise(
          runSetup({ table: table(1), mode: 'persistent', store }),
        ),
      ).toMatchObject({ kind: 'applied' });
      await run(
        table(1).Task.insert({ taskId: 't1', projectId: 'p1', title: 'x' }),
        layer,
      );
      const refused = await fails(
        runSetup({ table: table(3), mode: 'persistent', store }),
      );
      expect(refused).toBeInstanceOf(SetupRefused);
      expect((refused as SetupRefused).reason).toBe('breaking');
      // The loosened version replaced the first one; nothing else is kept.
      expect(await contractRow(store, 'version', 'Task', 'v1', '1')).toBeNull();
      expect(
        await contractRow(store, 'version', 'Task', 'v1', '2'),
      ).not.toBeNull();
    });

    it('leaves the committed contract readable when a commit stops part-way', async () => {
      const ids = Array.from({ length: 101 }, (_, index) => `E${index}`);
      const declare = (later: boolean) => {
        let builder = StdTable.make(NAME).primary('pk', 'sk') as unknown as {
          gsi(name: string, pk: string, sk: string): typeof builder;
          entity(
            schema: unknown,
            configure: (e: never) => unknown,
          ): typeof builder;
          build(): Parameters<typeof runSetup>[0]['table'];
        };
        if (later) builder = builder.gsi('GSI1', 'GSI1PK', 'GSI1SK');
        for (const id of ids) {
          const first = EntityESchema.make(id, 'id', { a: Schema.String });
          const schema = later
            ? first
                .evolve('v2', { b: Schema.String }, (v1) => ({ ...v1, b: '' }))
                .build()
            : first.build();
          builder = builder.entity(schema, (e: { primary(): unknown }) =>
            e.primary(),
          );
        }
        return builder.build();
      };
      for (const failing of ['second batch', 'table row'] as const) {
        let armed = false;
        let batches = 0;
        const { store } = memoryStore({
          failWrite: (kind, items) => {
            if (!armed) return false;
            if (kind === 'transact' && failing === 'second batch')
              return ++batches === 2;
            return (
              kind === 'write' &&
              failing === 'table row' &&
              items.some(({ meta }) => meta._e === '_std_table')
            );
          },
        });
        await Effect.runPromise(
          runSetup({ table: declare(false), mode: 'persistent', store }),
        );
        armed = true;
        expect(
          await fails(
            runSetup({ table: declare(true), mode: 'persistent', store }),
          ),
        ).toBeInstanceOf(OperationFailure);
        armed = false;
        // The retry still compares against the first contract, whole.
        const outcome = await Effect.runPromise(
          runSetup({ table: declare(true), mode: 'persistent', store }),
        );
        expect(outcome.kind).toBe('applied');
        const changes = outcome.kind === 'applied' ? outcome.changes : [];
        expect(
          changes.filter(({ subject }) => subject.kind === 'version'),
        ).toHaveLength(101);
        expect(
          changes.some(
            ({ subject }) => subject.kind === 'global-secondary-index',
          ),
        ).toBe(true);
        expect(
          await Effect.runPromise(
            runSetup({ table: declare(true), mode: 'persistent', store }),
          ),
        ).toEqual({ kind: 'unchanged' });
      }
    });

    it('reads every contract row and the table row strongly consistent', async () => {
      const { store, queries, gets } = await atV1(['t1']);
      await Effect.runPromise(
        runSetup({ table: v2Table(), mode: 'persistent', store }),
      );
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.every(({ consistent }) => consistent === true)).toBe(true);
      expect(gets.every((read) => read?.consistent === true)).toBe(true);
    });
  });
});

describe('runSetup, after the branch review', () => {
  it('offers what a check ahead of setup plans with, and nothing of Backfills', () => {
    expect(Object.keys(setupDoor)).toEqual(
      expect.arrayContaining([
        'planContract',
        'rowsOfContract',
        'NO_ROWS',
        'recordContract',
        'isOutdatedCode',
      ]),
    );
    for (const retired of ['planSetup', 'planBackfills', 'BackfillFailed'])
      expect(Object.keys(setupDoor)).not.toContain(retired);
  });

  const corruptTableRow = async (
    store: StdTableContract,
    data: (stored: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    const row = (await contractRow(store, 'table'))!;
    await Effect.runPromise(
      store.writeItem({ item: { ...row, data: data(row.data) as never } }),
    );
  };

  it('wipes a disposable table whose table row cannot be read, and refuses a persistent one', async () => {
    for (const mode of ['disposable', 'persistent'] as const) {
      const { store, layer } = memoryStore();
      await Effect.runPromise(runSetup({ table: v1Table(), mode, store }));
      await run(insertV1(['t1']), layer);
      await corruptTableRow(store, (data) => ({ ...data, mode: 42 }));
      const exit = await Effect.runPromiseExit(
        runSetup({ table: v1Table(), mode, store }),
      );
      if (mode === 'disposable') {
        expect(exit).toMatchObject({
          _tag: 'Success',
          value: { kind: 'wiped' },
        });
        expect(tasksOf(await allItems(store))).toHaveLength(0);
      } else {
        const refused = await fails(
          runSetup({ table: v1Table(), mode, store }),
        );
        expect(refused).toMatchObject({ reason: 'unreadable' });
        expect((refused as SetupRefused).message).toMatch(
          /^std-toolkit: table "board" has a stored contract/,
        );
        expect(tasksOf(await allItems(store))).toHaveLength(1);
      }
    }
  });

  it('refuses old code on a persistent table newer code set up, and wipes a disposable one', async () => {
    for (const mode of ['disposable', 'persistent'] as const) {
      const { store, layer } = memoryStore();
      await Effect.runPromise(runSetup({ table: v1Table(), mode, store }));
      const newer = v2Table();
      await Effect.runPromise(runSetup({ table: newer, mode, store }));
      await run(
        newer.Task.insert({
          taskId: 't1',
          projectId: 'p1',
          title: 'T',
          done: true,
        }),
        layer,
      );
      const exit = await Effect.runPromiseExit(
        runSetup({ table: v1Table(), mode, store }),
      );
      if (mode === 'disposable') {
        expect(exit).toMatchObject({
          _tag: 'Success',
          value: { kind: 'wiped' },
        });
        expect(tasksOf(await allItems(store))).toHaveLength(0);
      } else {
        const refused = await fails(
          runSetup({ table: v1Table(), mode, store }),
        );
        expect(isOutdatedCode(refused)).toBe(true);
        expect((refused as SetupRefused).message).toMatch(
          /this code is older than the data\. Reload or redeploy[\s\S]*Task v2/,
        );
        expect(tasksOf(await allItems(store))).toHaveLength(1);
      }
    }
  });

  it('refuses a persistent table row in a newer format as old code, and wipes a disposable one', async () => {
    for (const mode of ['disposable', 'persistent'] as const) {
      const { store, layer } = memoryStore();
      await Effect.runPromise(runSetup({ table: v1Table(), mode, store }));
      await run(insertV1(['t1']), layer);
      await corruptTableRow(store, (data) => ({ ...data, _v: 'v9' }));
      const exit = await Effect.runPromiseExit(
        runSetup({ table: v1Table(), mode, store }),
      );
      if (mode === 'disposable') {
        expect(exit).toMatchObject({
          _tag: 'Success',
          value: { kind: 'wiped' },
        });
        expect(tasksOf(await allItems(store))).toHaveLength(0);
      } else {
        const refused = await fails(
          runSetup({ table: v1Table(), mode, store }),
        );
        expect(isOutdatedCode(refused)).toBe(true);
        expect(tasksOf(await allItems(store))).toHaveLength(1);
      }
    }
  });
});
