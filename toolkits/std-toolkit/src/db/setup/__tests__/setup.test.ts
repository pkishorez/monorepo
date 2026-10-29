import { Effect, Schema, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { Memory } from '../../memory/index.js';
import {
  contractLayer,
  OperationFailure,
  StdTableService,
  type QueryRequest,
  type ReadOptions,
  type ScanRequest,
  type StdTableContract,
  type StoredItem,
} from '../../std-table/contract/index.js';
import type { BackfillDeclaration } from '../../std-table/definition/index.js';
import { encodeCompositeKey } from '../../std-table/key/index.js';
import { StdTable } from '../../std-table/table/index.js';
import { BackfillOrderRefused, planStages } from '../backfill/plan.js';
import { BackfillFailed, runSetup, SetupRefused } from '../index.js';

const NAME = 'board';

// Task, across four releases: v2 is a gap (an owner no v1 row knows), v3
// migrates purely, v4 is a gap again and comes with a new index.
const TaskV1 = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
}).build();
const TaskV2 = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { owner: Schema.String })
  .build();
const TaskV3 = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { owner: Schema.String })
  .evolve('v3', { done: Schema.Boolean }, (v2) => ({ ...v2, done: false }))
  .build();
const TaskV4 = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { owner: Schema.String })
  .evolve('v3', { done: Schema.Boolean }, (v2) => ({ ...v2, done: false }))
  .evolve('v4', { label: Schema.String })
  .build();

const v1Table = () =>
  StdTable.make(NAME)
    .primary('pk', 'sk')
    .entity(TaskV1, (e) => e.primary({ pk: ['projectId'] }))
    .build();

interface Calls {
  owner: string[];
  label: string[];
}

const v2Table = (calls: Calls, fail?: (taskId: string) => boolean) =>
  StdTable.make(NAME)
    .primary('pk', 'sk')
    .entity(TaskV2, (e) => e.primary({ pk: ['projectId'] }))
    .backfill('task-owner', {
      entity: 'Task',
      to: 'v2',
      run: (task) =>
        Effect.gen(function* () {
          calls.owner.push(task.taskId);
          if (fail?.(task.taskId)) return yield* Effect.fail('no owner');
          return { ...task, owner: 'ann' };
        }),
    })
    .build();

const v3Table = (calls: Calls) =>
  StdTable.make(NAME)
    .primary('pk', 'sk')
    .entity(TaskV3, (e) => e.primary({ pk: ['projectId'] }))
    .backfill('task-owner', {
      entity: 'Task',
      to: 'v2',
      run: (task) => {
        calls.owner.push(task.taskId);
        return Effect.succeed({ ...task, owner: 'ann' });
      },
    })
    .build();

const v4Table = (calls: Calls) =>
  StdTable.make(NAME)
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .entity(TaskV4, (e) =>
      e
        .primary({ pk: ['projectId'] })
        .index('GSI1', 'byOwner', { pk: ['owner'], sk: ['title'] }),
    )
    .backfill('task-owner', {
      entity: 'Task',
      to: 'v2',
      run: (task) => {
        calls.owner.push(task.taskId);
        return Effect.succeed({ ...task, owner: 'ann' });
      },
    })
    .backfill('task-label', {
      entity: 'Task',
      to: 'v4',
      after: ['task-owner'],
      run: (task) => {
        calls.label.push(task.taskId);
        return Effect.succeed({ ...task, label: task.title.toUpperCase() });
      },
    })
    .backfill('task-by-owner', { reindex: 'Task', after: ['task-label'] })
    .build();

const noCalls = (): Calls => ({ owner: [], label: [] });

/** A Memory table's StdTable contract, with every call counted. */
const memoryStore = (
  failWrite?: (
    kind: 'write' | 'transact',
    items: readonly StoredItem[],
  ) => boolean,
) => {
  const layer = Memory.make(v4Table(noCalls())).layer;
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
    getItem: (key, options) => (
      counts.getItem++,
      gets.push(options),
      inner.getItem(key, options)
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
      if (failWrite?.('write', [put.item]))
        return Effect.fail(new OperationFailure({ cause: 'injected' }));
      counts.writes.push(put.item);
      return inner.writeItem(put);
    },
    transactWriteItems: (items) => {
      const puts = items.flatMap((item) =>
        item.kind === 'put' ? [item.item] : [],
      );
      if (failWrite?.('transact', puts))
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
      v1Table().Task.insert({ taskId, projectId: 'p1', title: `t ${taskId}` }),
    { discard: true },
  );

const tasksOf = (items: readonly StoredItem[]) =>
  items.filter(({ meta }) => meta._e === 'Task');

describe('runSetup', () => {
  it('records a fresh empty table with every Backfill done, scanning nothing', async () => {
    const { store, counts } = memoryStore();
    const calls = noCalls();
    const outcome = await Effect.runPromise(
      runSetup({ table: v4Table(calls), mode: 'persistent', store }),
    );
    expect(outcome).toEqual({ kind: 'created' });
    // One page to see the table is empty; no Backfill scan.
    expect(counts.scanItems).toBe(1);
    expect(calls).toEqual(noCalls());
    for (const id of ['task-owner', 'task-label', 'task-by-owner'])
      expect((await contractRow(store, 'backfill', id))?.data).toMatchObject({
        status: 'done',
        rowsRewritten: 0,
      });
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
    const { store, counts, reset, layer } = memoryStore();
    await Effect.runPromise(
      runSetup({ table: v1Table(), mode: 'persistent', store }),
    );
    await run(insertV1(['t1']), layer);
    reset();
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

  it('catches up a table that skipped releases in one scan, each row written once', async () => {
    const { store, counts, reset, layer } = memoryStore();
    await Effect.runPromise(
      runSetup({ table: v1Table(), mode: 'persistent', store }),
    );
    await run(insertV1(['t1', 't2', 't3']), layer);
    reset();
    const calls = noCalls();
    const table = v4Table(calls);
    const outcome = await Effect.runPromise(
      runSetup({ table, mode: 'persistent', store }),
    );
    expect(outcome).toMatchObject({
      kind: 'applied',
      backfills: ['task-owner', 'task-label', 'task-by-owner'],
    });
    expect(calls).toEqual({
      owner: ['t1', 't2', 't3'],
      label: ['t1', 't2', 't3'],
    });
    // One scan, then one verify pass that rewrites nothing.
    expect(counts.scanItems).toBe(2);
    expect(tasksOf(counts.writes)).toHaveLength(3);
    for (const task of tasksOf(await allItems(store))) {
      expect(task.data).toMatchObject({
        _v: 'v4',
        owner: 'ann',
        done: false,
        label: task.data.title === 't t1' ? 'T T1' : expect.any(String),
      });
      expect(task.keys.GSI1PK).toBeDefined();
    }
    const byOwner = await run(
      table.Task.query('byOwner', { pk: { owner: 'ann' }, '>=': null }),
      layer,
    );
    expect(byOwner.items).toHaveLength(3);
    expect(
      (await contractRow(store, 'backfill', 'task-owner'))?.data,
    ).toMatchObject({ status: 'done', rowsRewritten: 3, cursor: null });
    // Recorded: the next setup is one read.
    expect(
      await Effect.runPromise(runSetup({ table, mode: 'persistent', store })),
    ).toEqual({ kind: 'unchanged' });
  });

  it('runs a Backfill that reads another entity after that entity is filled', async () => {
    const ProjectV1 = EntityESchema.make('Project', 'projectId', {
      name: Schema.String,
    }).build();
    const ProjectV2 = EntityESchema.make('Project', 'projectId', {
      name: Schema.String,
    })
      .evolve('v2', { slug: Schema.String })
      .build();
    const Task1 = EntityESchema.make('Task', 'taskId', {
      projectId: Schema.String,
    }).build();
    const Task2 = EntityESchema.make('Task', 'taskId', {
      projectId: Schema.String,
    })
      .evolve('v2', { projectSlug: Schema.String })
      .build();
    const before = StdTable.make(NAME)
      .primary('pk', 'sk')
      .entity(ProjectV1, (e) => e.primary())
      .entity(Task1, (e) => e.primary())
      .build();
    const order: string[] = [];
    const after = StdTable.make(NAME)
      .primary('pk', 'sk')
      .entity(ProjectV2, (e) => e.primary())
      .entity(Task2, (e) => e.primary())
      .backfill('project-slug', {
        entity: 'Project',
        to: 'v2',
        run: (project) => {
          order.push(`project ${project.projectId}`);
          return Effect.succeed({
            ...project,
            slug: project.name.toLowerCase(),
          });
        },
      })
      .backfill('task-slug', {
        entity: 'Task',
        to: 'v2',
        after: ['project-slug'],
        run: (task, db) =>
          Effect.gen(function* () {
            order.push(`task ${task.taskId}`);
            const project = yield* db.Project.get({
              projectId: task.projectId,
            });
            return { ...task, projectSlug: project!.value.slug };
          }),
      })
      .build();
    const { store, layer } = memoryStore();
    await Effect.runPromise(
      runSetup({ table: before, mode: 'persistent', store }),
    );
    await run(
      Effect.gen(function* () {
        yield* before.Task.insert({ taskId: 't1', projectId: 'p1' });
        yield* before.Project.insert({ projectId: 'p1', name: 'Apollo' });
      }),
      layer,
    );
    await Effect.runPromise(
      runSetup({ table: after, mode: 'persistent', store }),
    );
    expect(order).toEqual(['project p1', 'task t1']);
    const task = await run(after.Task.get({ taskId: 't1' }), layer);
    expect(task?.value.projectSlug).toBe('apollo');
  });

  const declared = (
    id: string,
    entity: string,
    after: string[] = [],
    kind: 'gap' | 'reindex' = 'reindex',
  ): BackfillDeclaration => ({
    id,
    kind,
    entity,
    to: kind === 'gap' ? 'v2' : null,
    after,
    run: null,
  });
  const stagesOf = (pending: readonly BackfillDeclaration[]) =>
    planStages(pending).map(({ entity, backfills }) => [
      entity,
      backfills.map(({ id }) => id),
    ]);

  it('refuses Backfills whose entities wait on one another', () => {
    const cycle = [
      declared('task', 'Task'),
      declared('project', 'Project', ['task']),
      declared('task-later', 'Task', ['project']),
    ];
    expect(() => planStages(cycle)).toThrow(BackfillOrderRefused);
    expect(() => planStages(cycle)).toThrow(
      /Task, Project wait on one another in a cycle/,
    );
  });

  it("puts all of one entity's Backfills in one stage, ordered between entities", () => {
    expect(
      stagesOf([
        declared('t1', 'Task'),
        declared('p1', 'Project'),
        declared('t2', 'Task'),
      ]),
    ).toEqual([
      ['Task', ['t1', 't2']],
      ['Project', ['p1']],
    ]);
    // Only Task v3 waits on Project v2: Project runs first, then both Task gaps.
    expect(
      stagesOf([
        declared('task-v2', 'Task', [], 'gap'),
        declared('project-v2', 'Project', [], 'gap'),
        declared('task-v3', 'Task', ['project-v2'], 'gap'),
      ]),
    ).toEqual([
      ['Project', ['project-v2']],
      ['Task', ['task-v2', 'task-v3']],
    ]);
  });

  it('refuses a page size that cannot hold a row, before changing anything', async () => {
    const { store } = memoryStore();
    await Effect.runPromise(
      runSetup({ table: v1Table(), mode: 'persistent', store }),
    );
    const before = await allItems(store);
    for (const pageSize of [0, -1, 1.5]) {
      const exit = await Effect.runPromiseExit(
        runSetup({
          table: v2Table(noCalls()),
          mode: 'persistent',
          store,
          pageSize,
        }),
      );
      expect(exit._tag).toBe('Failure');
    }
    expect(await allItems(store)).toEqual(before);
  });

  it('resumes from the cursor after a failure', async () => {
    const { store, layer } = memoryStore();
    await Effect.runPromise(
      runSetup({ table: v1Table(), mode: 'persistent', store }),
    );
    await run(insertV1(['t1', 't2', 't3', 't4', 't5', 't6']), layer);
    const failing = noCalls();
    const failed = await fails(
      runSetup({
        table: v2Table(failing, (taskId) => taskId === 't5'),
        mode: 'persistent',
        store,
        pageSize: 2,
      }),
    );
    expect(failed).toBeInstanceOf(BackfillFailed);
    expect(failing.owner).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect(
      (await contractRow(store, 'backfill', 'task-owner'))?.data,
    ).toMatchObject({
      status: 'running',
      rowsRewritten: 4,
      cursor: { sk: encodeCompositeKey(['t4']) },
    });
    const calls = noCalls();
    await Effect.runPromise(
      runSetup({
        table: v2Table(calls),
        mode: 'persistent',
        store,
        pageSize: 2,
      }),
    );
    expect(calls.owner).toEqual(['t5', 't6']);
    expect(
      (await contractRow(store, 'backfill', 'task-owner'))?.data,
    ).toMatchObject({ status: 'done', rowsRewritten: 6 });
  });

  it('catches an old row written behind the cursor with a verify pass', async () => {
    const { store, layer } = memoryStore();
    await Effect.runPromise(
      runSetup({ table: v1Table(), mode: 'persistent', store }),
    );
    await run(insertV1(['t3', 't4', 't5', 't6']), layer);
    let written = false;
    const calls: string[] = [];
    const table = StdTable.make(NAME)
      .primary('pk', 'sk')
      .entity(TaskV2, (e) => e.primary({ pk: ['projectId'] }))
      .backfill('task-owner', {
        entity: 'Task',
        to: 'v2',
        run: (task) =>
          Effect.gen(function* () {
            calls.push(task.taskId);
            if (task.taskId === 't5' && !written) {
              written = true;
              // An old release writes an old row the scan has passed.
              yield* insertV1(['t1']);
            }
            return { ...task, owner: 'ann' };
          }),
      })
      .build();
    await Effect.runPromise(
      runSetup({ table, mode: 'persistent', store, pageSize: 2 }),
    );
    expect(calls).toEqual(['t3', 't4', 't5', 't6', 't1']);
    for (const task of tasksOf(await allItems(store)))
      expect(task.data._v).toBe('v2');
  });

  it('refuses a persistent change that needs a Backfill none covers', async () => {
    const { store } = memoryStore();
    await Effect.runPromise(
      runSetup({ table: v1Table(), mode: 'persistent', store }),
    );
    const withIndex = StdTable.make(NAME)
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .entity(TaskV1, (e) =>
        e
          .primary({ pk: ['projectId'] })
          .index('GSI1', 'byTitle', { pk: ['title'] }),
      )
      .build();
    const refused = await fails(
      runSetup({ table: withIndex, mode: 'persistent', store }),
    );
    expect(refused).toBeInstanceOf(SetupRefused);
    expect((refused as SetupRefused).reason).toBe('backfill-missing');
    expect((refused as SetupRefused).message).toMatch(/byTitle/);
  });

  it('wipes a disposable table with a gap and never runs its Backfill', async () => {
    const { store, layer } = memoryStore();
    await Effect.runPromise(
      runSetup({ table: v1Table(), mode: 'disposable', store }),
    );
    await run(insertV1(['t1', 't2']), layer);
    const calls = noCalls();
    const outcome = await Effect.runPromise(
      runSetup({ table: v2Table(calls), mode: 'disposable', store }),
    );
    expect(outcome.kind).toBe('wiped');
    expect(calls.owner).toEqual([]);
    expect(tasksOf(await allItems(store))).toHaveLength(0);
    expect(
      (await contractRow(store, 'backfill', 'task-owner'))?.data,
    ).toMatchObject({ status: 'done' });
  });

  it('leaves the contract unwritten and the Backfill not done when a run fails', async () => {
    const { store, layer } = memoryStore();
    await Effect.runPromise(
      runSetup({ table: v1Table(), mode: 'persistent', store }),
    );
    await run(insertV1(['t1']), layer);
    const failed = await fails(
      runSetup({
        table: v2Table(noCalls(), () => true),
        mode: 'persistent',
        store,
      }),
    );
    expect(failed).toBeInstanceOf(BackfillFailed);
    expect(failed).toMatchObject({
      backfill: 'task-owner',
      reason: 'run',
      key: {
        pk: encodeCompositeKey(['Task', 'p1']),
        sk: encodeCompositeKey(['t1']),
      },
    });
    expect(await contractRow(store, 'backfill', 'task-owner')).toBeNull();
    // The table row still records v1.
    expect(
      await Effect.runPromise(
        runSetup({ table: v1Table(), mode: 'persistent', store }),
      ),
    ).toEqual({ kind: 'unchanged' });
  });

  it('keeps reserved rows out of scan and entity reads', async () => {
    const { store, layer } = memoryStore();
    const table = v1Table();
    await Effect.runPromise(runSetup({ table, mode: 'persistent', store }));
    await run(insertV1(['t1']), layer);
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
    const { store, layer } = memoryStore();
    await Effect.runPromise(
      runSetup({ table: v1Table(), mode: 'persistent', store }),
    );
    const v1Row = await contractRow(store, 'version', 'Task', 'v1', '1');
    expect(v1Row?.data).toMatchObject({ identity: 'Task', gap: false });
    await run(insertV1(['t1']), layer);
    await Effect.runPromise(
      runSetup({ table: v3Table(noCalls()), mode: 'persistent', store }),
    );
    expect(await contractRow(store, 'version', 'Task', 'v1', '1')).toEqual(
      v1Row,
    );
    expect(
      (await contractRow(store, 'version', 'Task', 'v2', '2'))?.data,
    ).toMatchObject({ gap: true });
    expect(
      (await contractRow(store, 'version', 'Task', 'v3', '2'))?.data,
    ).toMatchObject({ gap: false });
  });

  describe('regressions', () => {
    it('refuses a Backfill that moves a row to another key, leaving that row alone', async () => {
      const { store, layer } = memoryStore();
      const before = v1Table();
      await Effect.runPromise(
        runSetup({ table: before, mode: 'persistent', store }),
      );
      // One transaction: both rows share one `_u`.
      await run(
        Effect.gen(function* () {
          yield* before.transact([
            yield* before.Task.insertOp({
              taskId: 't1',
              projectId: 'p1',
              title: 'first',
            }),
            yield* before.Task.insertOp({
              taskId: 't2',
              projectId: 'p1',
              title: 'second',
            }),
          ]);
        }),
        layer,
      );
      const moving = StdTable.make(NAME)
        .primary('pk', 'sk')
        .entity(TaskV2, (e) => e.primary({ pk: ['projectId'] }))
        .backfill('task-owner', {
          entity: 'Task',
          to: 'v2',
          run: (task) =>
            Effect.succeed({ ...task, taskId: 't2', owner: 'ann' }),
        })
        .build();
      const failed = await fails(
        runSetup({ table: moving, mode: 'persistent', store }),
      );
      expect(failed).toMatchObject({
        _tag: 'BackfillFailed',
        backfill: 'task-owner',
        reason: 'key-changed',
        key: { sk: encodeCompositeKey(['t1']) },
      });
      const second = tasksOf(await allItems(store)).find(
        ({ sk }) => sk === encodeCompositeKey(['t2']),
      );
      expect(second?.data).toMatchObject({ _v: 'v1', title: 'second' });
    });

    it('resumes when a finished Backfill is not yet in a committed contract', async () => {
      const ProjectV1 = EntityESchema.make('Project', 'projectId', {
        name: Schema.String,
      }).build();
      const ProjectV2 = EntityESchema.make('Project', 'projectId', {
        name: Schema.String,
      })
        .evolve('v2', { slug: Schema.String })
        .build();
      const Task1 = EntityESchema.make('Task', 'taskId', {
        projectId: Schema.String,
      }).build();
      const Task2 = EntityESchema.make('Task', 'taskId', {
        projectId: Schema.String,
      })
        .evolve('v2', { projectSlug: Schema.String })
        .build();
      const before = StdTable.make(NAME)
        .primary('pk', 'sk')
        .entity(ProjectV1, (e) => e.primary())
        .entity(Task1, (e) => e.primary())
        .build();
      const after = (failTask: boolean) =>
        StdTable.make(NAME)
          .primary('pk', 'sk')
          .entity(ProjectV2, (e) => e.primary())
          .entity(Task2, (e) => e.primary())
          .backfill('project-slug', {
            entity: 'Project',
            to: 'v2',
            run: (project) =>
              Effect.succeed({ ...project, slug: project.name.toLowerCase() }),
          })
          .backfill('task-slug', {
            entity: 'Task',
            to: 'v2',
            after: ['project-slug'],
            run: (task) =>
              failTask
                ? Effect.fail('not yet')
                : Effect.succeed({ ...task, projectSlug: 'apollo' }),
          })
          .build();
      const { store, layer } = memoryStore();
      await Effect.runPromise(
        runSetup({ table: before, mode: 'persistent', store }),
      );
      await run(
        Effect.gen(function* () {
          yield* before.Project.insert({ projectId: 'p1', name: 'Apollo' });
          yield* before.Task.insert({ taskId: 't1', projectId: 'p1' });
        }),
        layer,
      );
      expect(
        await fails(
          runSetup({ table: after(true), mode: 'persistent', store }),
        ),
      ).toBeInstanceOf(BackfillFailed);
      expect(
        (await contractRow(store, 'backfill', 'project-slug'))?.data,
      ).toMatchObject({ status: 'done' });
      // An old client writes an old Project after the uncommitted Backfill.
      await run(
        before.Project.insert({ projectId: 'p2', name: 'Gemini' }),
        layer,
      );
      const outcome = await Effect.runPromise(
        runSetup({ table: after(false), mode: 'persistent', store }),
      );
      // Not yet committed, so not trusted: project-slug checks every row again.
      expect(outcome).toMatchObject({
        kind: 'applied',
        backfills: ['project-slug', 'task-slug'],
      });
      const late = await run(
        after(false).Project.get({ projectId: 'p2' }),
        layer,
      );
      expect(late?.value.slug).toBe('gemini');
    });

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
        const { store } = memoryStore((kind, items) => {
          if (!armed) return false;
          if (kind === 'transact' && failing === 'second batch')
            return ++batches === 2;
          return (
            kind === 'write' &&
            failing === 'table row' &&
            items.some(({ meta }) => meta._e === '_std_table')
          );
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

    it("refuses a reindex another entity reads before that entity's gap, writing nothing", async () => {
      const Project1 = EntityESchema.make('Project', 'projectId', {
        name: Schema.String,
      }).build();
      const Project2 = EntityESchema.make('Project', 'projectId', {
        name: Schema.String,
      })
        .evolve('v2', { openTasks: Schema.Int })
        .build();
      const before = StdTable.make(NAME)
        .primary('pk', 'sk')
        .gsi('GSI1', 'GSI1PK', 'GSI1SK')
        .entity(TaskV1, (e) => e.primary({ pk: ['projectId'] }))
        .entity(Project1, (e) => e.primary())
        .build();
      const after = StdTable.make(NAME)
        .primary('pk', 'sk')
        .gsi('GSI1', 'GSI1PK', 'GSI1SK')
        .entity(TaskV2, (e) =>
          e
            .primary({ pk: ['projectId'] })
            .index('GSI1', 'byProject', { pk: ['projectId'] }),
        )
        .entity(Project2, (e) => e.primary())
        .backfill('task-by-project', { reindex: 'Task' })
        .backfill('project-open-tasks', {
          entity: 'Project',
          to: 'v2',
          after: ['task-by-project'],
          run: (project, db) =>
            Effect.map(
              db.Task.query('byProject', {
                pk: { projectId: project.projectId },
                '>=': null,
              }),
              ({ items }) => ({ ...project, openTasks: items.length }),
            ),
        })
        .backfill('task-owner', {
          entity: 'Task',
          to: 'v2',
          after: ['project-open-tasks'],
          run: (task) => Effect.succeed({ ...task, owner: 'ann' }),
        })
        .build();
      const { store, counts, reset, layer } = memoryStore();
      await Effect.runPromise(
        runSetup({ table: before, mode: 'persistent', store }),
      );
      await run(
        Effect.gen(function* () {
          yield* before.Project.insert({ projectId: 'p1', name: 'Apollo' });
          yield* insertV1(['t1']);
        }),
        layer,
      );
      reset();
      const refused = await fails(
        runSetup({ table: after, mode: 'persistent', store }),
      );
      expect(refused).toMatchObject({
        _tag: 'SetupRefused',
        reason: 'backfill-order',
      });
      expect(counts.writes).toEqual([]);
    });

    it("runs an entity's gaps together when only the later one waits on another entity", async () => {
      const Project1 = EntityESchema.make('Project', 'projectId', {
        name: Schema.String,
      }).build();
      const Project2 = EntityESchema.make('Project', 'projectId', {
        name: Schema.String,
      })
        .evolve('v2', { slug: Schema.String })
        .build();
      const Task3 = EntityESchema.make('Task', 'taskId', {
        projectId: Schema.String,
        title: Schema.String,
      })
        .evolve('v2', { owner: Schema.String })
        .evolve('v3', { projectSlug: Schema.String })
        .build();
      const before = StdTable.make(NAME)
        .primary('pk', 'sk')
        .entity(TaskV1, (e) => e.primary({ pk: ['projectId'] }))
        .entity(Project1, (e) => e.primary())
        .build();
      const order: string[] = [];
      const after = StdTable.make(NAME)
        .primary('pk', 'sk')
        .entity(Task3, (e) => e.primary({ pk: ['projectId'] }))
        .entity(Project2, (e) => e.primary())
        .backfill('task-v2', {
          entity: 'Task',
          to: 'v2',
          run: (task) => {
            order.push('task-v2');
            return Effect.succeed({ ...task, owner: 'ann' });
          },
        })
        .backfill('project-v2', {
          entity: 'Project',
          to: 'v2',
          run: (project) => {
            order.push('project-v2');
            return Effect.succeed({ ...project, slug: 'apollo' });
          },
        })
        .backfill('task-v3', {
          entity: 'Task',
          to: 'v3',
          after: ['project-v2'],
          run: (task, db) =>
            Effect.gen(function* () {
              order.push('task-v3');
              const project = yield* db.Project.get({
                projectId: task.projectId,
              });
              return { ...task, projectSlug: project!.value.slug };
            }),
        })
        .build();
      const { store, layer } = memoryStore();
      await Effect.runPromise(
        runSetup({ table: before, mode: 'persistent', store }),
      );
      await run(
        Effect.gen(function* () {
          yield* before.Project.insert({ projectId: 'p1', name: 'Apollo' });
          yield* insertV1(['t1']);
        }),
        layer,
      );
      const outcome = await Effect.runPromise(
        runSetup({ table: after, mode: 'persistent', store }),
      );
      expect(outcome).toMatchObject({
        kind: 'applied',
        backfills: ['project-v2', 'task-v2', 'task-v3'],
      });
      expect(order).toEqual(['project-v2', 'task-v2', 'task-v3']);
      const task = await run(
        after.Task.get({ projectId: 'p1', taskId: 't1' }),
        layer,
      );
      expect(task?.value).toMatchObject({
        owner: 'ann',
        projectSlug: 'apollo',
      });
    });

    it('starts a Backfill over when its uncommitted progress was toward another contract', async () => {
      const start = () =>
        StdTable.make(NAME).primary('pk', 'sk').gsi('GSI1', 'GSI1PK', 'GSI1SK');
      const plain = () =>
        start()
          .entity(TaskV1, (e) => e.primary({ pk: ['projectId'] }))
          .build();
      const keyed = <const P extends 'title' | 'projectId'>(pattern: P) =>
        start()
          .entity(TaskV1, (e) =>
            e
              .primary({ pk: ['projectId'] })
              .index('GSI1', 'byKey', { pk: [pattern] }),
          )
          .backfill('task-by-key', { reindex: 'Task' })
          .build();
      let armed = false;
      const { store, layer } = memoryStore(
        (kind, items) =>
          armed &&
          kind === 'write' &&
          items.some(({ meta }) => meta._e === '_std_table'),
      );
      await Effect.runPromise(
        runSetup({ table: plain(), mode: 'persistent', store }),
      );
      await run(insertV1(['t1', 't2']), layer);
      armed = true;
      expect(
        await fails(
          runSetup({ table: keyed('title'), mode: 'persistent', store }),
        ),
      ).toBeInstanceOf(OperationFailure);
      expect(
        (await contractRow(store, 'backfill', 'task-by-key'))?.data,
      ).toMatchObject({ status: 'done', rowsRewritten: 2 });
      armed = false;
      const table = keyed('projectId');
      const outcome = await Effect.runPromise(
        runSetup({ table, mode: 'persistent', store }),
      );
      expect(outcome).toMatchObject({
        kind: 'applied',
        backfills: ['task-by-key'],
      });
      const found = await run(
        table.Task.query('byKey', { pk: { projectId: 'p1' }, '>=': null }),
        layer,
      );
      expect(found.items.map(({ value }) => value.taskId)).toEqual([
        't1',
        't2',
      ]);
    });

    it('reads every contract row with a strongly consistent query', async () => {
      const { store, queries } = memoryStore();
      await Effect.runPromise(
        runSetup({ table: v1Table(), mode: 'persistent', store }),
      );
      await Effect.runPromise(
        runSetup({ table: v3Table(noCalls()), mode: 'persistent', store }),
      );
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.every(({ consistent }) => consistent === true)).toBe(true);
    });

    it('scans with strongly consistent reads, and gives `run` consistent reads', async () => {
      const Project1 = EntityESchema.make('Project', 'projectId', {
        name: Schema.String,
      }).build();
      const before = StdTable.make(NAME)
        .primary('pk', 'sk')
        .entity(TaskV1, (e) => e.primary({ pk: ['projectId'] }))
        .entity(Project1, (e) => e.primary())
        .build();
      const after = StdTable.make(NAME)
        .primary('pk', 'sk')
        .entity(TaskV2, (e) => e.primary({ pk: ['projectId'] }))
        .entity(Project1, (e) => e.primary())
        .backfill('task-owner', {
          entity: 'Task',
          to: 'v2',
          run: (task, db) =>
            Effect.gen(function* () {
              const project = yield* db.Project.get({ projectId: 'p1' });
              const projects = yield* db.Project.query('primary', {
                pk: {},
                '>=': null,
              });
              return {
                ...task,
                owner: `${project!.value.name} ${projects.items.length}`,
              };
            }),
        })
        .build();
      const { store, layer, scans, gets, queries, reset } = memoryStore();
      await Effect.runPromise(
        runSetup({ table: before, mode: 'persistent', store }),
      );
      await run(
        Effect.gen(function* () {
          yield* before.Project.insert({ projectId: 'p1', name: 'Apollo' });
          yield* insertV1(['t1']);
        }),
        layer,
      );
      reset();
      await Effect.runPromise(
        runSetup({ table: after, mode: 'persistent', store }),
      );
      expect(scans.length).toBeGreaterThan(0);
      expect(scans.every(({ consistent }) => consistent === true)).toBe(true);
      // The table row read, then run's get.
      expect(gets.length).toBeGreaterThan(1);
      expect(gets.every((options) => options?.consistent === true)).toBe(true);
      expect(queries.every(({ consistent }) => consistent === true)).toBe(true);
      expect(
        queries.some(({ pk }) => pk === encodeCompositeKey(['Project'])),
      ).toBe(true);
    });
  });
});
