import { Effect, Exit, Layer, Schema, Stream } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Entity, SingletonEntity } from '../../../core/index.js';
import { EntityESchema, ESchema } from '../../../eschema/index.js';
import { StdTable, type DatabaseError } from '../../index.js';
import { Memory } from '../../memory/index.js';
import {
  StdTableService,
  type StdTableContract,
} from '../../std-table/contract/index.js';
import { readMigrationRow } from '../contract/index.js';
import {
  MigrationRefused,
  MigrationRowFailed,
  runSetup,
  type MigrationError,
  type MigrationEvent,
  type MigrationHandlers,
  type TableMode,
} from '../index.js';

// The old board: projects, their tasks, comments on tasks, and preferences.
const ProjectV1 = EntityESchema.make('Project', 'projectId', {
  owner: Schema.String,
}).build();
const TaskV1 = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
}).build();
const Comment = EntityESchema.make('Comment', 'commentId', {
  taskId: Schema.String,
  text: Schema.String,
}).build();
const PrefsV1 = ESchema.make('Prefs', { theme: Schema.String }).build();

const oldBoard = StdTable.make('board-v1')
  .primary('pk', 'sk')
  .entity(ProjectV1, (e) => e.primary())
  .entity(TaskV1, (e) => e.primary({ pk: ['projectId'] }))
  .entity(Comment, (e) => e.primary({ pk: ['taskId'] }))
  .singleEntity(PrefsV1, { default: { theme: 'light' } })
  .build();

// The new board: every task knows its owner and gets a created activity.
const Project = EntityESchema.make('Project', 'projectId', {
  owner: Schema.String,
  archived: Schema.Boolean,
}).build();
const Task = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
  owner: Schema.String,
}).build();
const Activity = EntityESchema.make('Activity', 'activityId', {
  taskId: Schema.String,
  text: Schema.String,
}).build();
const Prefs = ESchema.make('Prefs', { theme: Schema.String }).build();

const board = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Project, (e) => e.primary())
  .entity(Task, (e) => e.primary({ pk: ['projectId'] }))
  .entity(Activity, (e) => e.primary({ pk: ['taskId'] }))
  .singleEntity(Prefs, { default: { theme: 'light' } })
  .build();

type AnyTable = Parameters<typeof runSetup>[0]['table'];

/** A Memory table and its contract, set up under `mode` unless `setUp` is false. */
const memory = (
  table: AnyTable,
  options: { readonly mode?: TableMode; readonly setUp?: boolean } = {},
) => {
  const layer = Memory.make(table).layer;
  const store = Effect.runSync(
    Effect.map(StdTableService(table.logicalName), (s) => s.contract).pipe(
      Effect.provide(layer),
    ),
  );
  if (options.setUp !== false)
    Effect.runSync(
      runSetup({ table, mode: options.mode ?? 'persistent', store }),
    );
  return { layer, store };
};

const seed = Effect.gen(function* () {
  yield* oldBoard.Project.insert({ projectId: 'p1', owner: 'ada' });
  yield* oldBoard.Project.insert({ projectId: 'p2', owner: 'grace' });
  yield* oldBoard.Task.insert({ projectId: 'p1', taskId: 't1', title: 'Plan' });
  yield* oldBoard.Task.insert({ projectId: 'p1', taskId: 't2', title: 'Ship' });
  yield* oldBoard.Task.insert({ projectId: 'p2', taskId: 't3', title: 'Test' });
  yield* oldBoard.Comment.insert({ taskId: 't1', commentId: 'c1', text: 'hi' });
  yield* oldBoard.Prefs.put({ theme: 'dark' });
});

const handlers = {
  Project: (project, { next }) =>
    next.Project.insert({ ...project.value, archived: false }),
  Task: (task, { old, next }) =>
    Effect.gen(function* () {
      const project = yield* old.Project.get({
        projectId: task.value.projectId,
      });
      yield* next.Task.insert({
        ...task.value,
        owner: project?.value.owner ?? 'nobody',
      });
      yield* next.Activity.insert({
        taskId: task.value.taskId,
        activityId: `${task.value.taskId}-created`,
        text: 'created',
      });
    }),
  Comment: () => Effect.void,
  Prefs: (prefs, { next }) => next.Prefs.put(prefs.value),
} satisfies MigrationHandlers<typeof oldBoard, typeof board>;

const migration = (options?: Parameters<typeof StdTable.migrate>[3]) =>
  StdTable.migrate(oldBoard, board, handlers, options);

const tables = () => {
  const old = memory(oldBoard);
  const next = memory(board);
  return { old, next, layer: Layer.merge(old.layer, next.layer) };
};

const collect = <E>(
  stream: Stream.Stream<MigrationEvent, E, never>,
): Promise<readonly MigrationEvent[]> =>
  Effect.runPromise(Stream.runCollect(stream)).then((events) => [...events]);

const failure = async <E>(stream: Stream.Stream<MigrationEvent, E, never>) => {
  const exit = await Effect.runPromise(Effect.exit(Stream.runDrain(stream)));
  if (!Exit.isFailure(exit)) throw new Error('expected the run to fail');
  return exit.cause.reasons.find((reason) => reason._tag === 'Fail')?.error;
};

const rowsOf = (store: StdTableContract) =>
  Effect.runSync(store.scanItems({ limit: 1000 })).items;

const appRows = (store: StdTableContract) =>
  rowsOf(store)
    .filter(({ meta }) => !meta._e.startsWith('_std_'))
    .map(({ meta, data }) => ({ entity: meta._e, data }));

describe('StdTable.migrate', () => {
  it('moves every row through its handler: a cross-entity read, a dropped entity, one row into two', async () => {
    const { next, layer } = tables();
    await Effect.runPromise(seed.pipe(Effect.provide(layer)));

    const events = await collect(migration().pipe(Stream.provide(layer)));

    expect(events[0]).toEqual({
      _tag: 'Started',
      attempt: 1,
      restarted: false,
    });
    const counts = {
      Project: { read: 2, written: 2 },
      Task: { read: 3, written: 6 },
      Comment: { read: 1, written: 0 },
      Prefs: { read: 1, written: 1 },
    };
    expect(events.at(-1)).toEqual({ _tag: 'Done', counts });
    const tasks = await Effect.runPromise(
      board.Task.query('primary', { pk: { projectId: 'p1' }, '>=': null }).pipe(
        Effect.provide(layer),
      ),
    );
    expect(tasks.items.map(({ value }) => value)).toEqual([
      { projectId: 'p1', taskId: 't1', title: 'Plan', owner: 'ada' },
      { projectId: 'p1', taskId: 't2', title: 'Ship', owner: 'ada' },
    ]);
    const project = await Effect.runPromise(
      board.Project.get({ projectId: 'p2' }).pipe(Effect.provide(layer)),
    );
    expect(project?.value).toEqual({
      projectId: 'p2',
      owner: 'grace',
      archived: false,
    });
    const prefs = await Effect.runPromise(
      board.Prefs.get().pipe(Effect.provide(layer)),
    );
    expect(prefs.value).toEqual({ theme: 'dark' });
    const entities = appRows(next.store).map(({ entity }) => entity);
    expect(entities.filter((e) => e === 'Activity')).toHaveLength(3);
    expect(entities).not.toContain('Comment');

    const row = Effect.runSync(readMigrationRow(next.store));
    expect(row?.value).toMatchObject({
      from: { table: 'board-v1' },
      state: 'done',
      attempt: 1,
      counts,
    });
  });

  it('skips a deleted row: no handler sees it, and it is not counted as read', async () => {
    const { next, layer } = tables();
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* seed;
        yield* oldBoard.Task.delete({ projectId: 'p1', taskId: 't2' });
      }).pipe(Effect.provide(layer)),
    );
    const seen: string[] = [];

    const events = await collect(
      StdTable.migrate(oldBoard, board, {
        ...handlers,
        Task: (task, tables) =>
          Effect.sync(() => seen.push(task.value.taskId)).pipe(
            Effect.andThen(handlers.Task(task, tables)),
          ),
      }).pipe(Stream.provide(layer)),
    );

    expect(seen.sort()).toEqual(['t1', 't3']);
    expect(events.at(-1)).toMatchObject({
      _tag: 'Done',
      counts: { Task: { read: 2, written: 4 } },
    });
    const tasks = appRows(next.store).filter(({ entity }) => entity === 'Task');
    expect(tasks.map(({ data }) => data.taskId).sort()).toEqual(['t1', 't3']);
  });

  it('is skipped once done, and writes nothing more', async () => {
    const { next, layer } = tables();
    await Effect.runPromise(seed.pipe(Effect.provide(layer)));
    await collect(migration().pipe(Stream.provide(layer)));
    const before = rowsOf(next.store);

    const again = await collect(migration().pipe(Stream.provide(layer)));

    expect(again).toEqual([{ _tag: 'Skipped' }]);
    expect(rowsOf(next.store)).toEqual(before);
  });

  it('refuses a table that finished a migration from another source', async () => {
    const { next, layer } = tables();
    await collect(migration().pipe(Stream.provide(layer)));
    const other = StdTable.make('board-v0')
      .primary('pk', 'sk')
      .entity(ProjectV1, (e) => e.primary())
      .build();
    const source = memory(other);

    const error = await failure(
      StdTable.migrate(other, board, {
        Project: (p, { next }) =>
          next.Project.insert({ ...p.value, archived: true }),
      }).pipe(Stream.provide(Layer.merge(source.layer, next.layer))),
    );

    expect(error).toBeInstanceOf(MigrationRefused);
    expect((error as MigrationRefused).reason).toBe('other-source');
  });

  it('refuses a new table that already holds rows no migration wrote', async () => {
    const { layer } = tables();
    await Effect.runPromise(
      board.Project.insert({
        projectId: 'p9',
        owner: 'x',
        archived: false,
      }).pipe(Effect.provide(layer)),
    );

    const error = await failure(migration().pipe(Stream.provide(layer)));

    expect((error as MigrationRefused).reason).toBe('target-in-use');
  });

  it('migrates an old table with nothing in it as empty', async () => {
    const counts = {
      Project: { read: 0, written: 0 },
      Task: { read: 0, written: 0 },
      Comment: { read: 0, written: 0 },
      Prefs: { read: 0, written: 0 },
    };
    // Set up, and holding nothing.
    const empty = tables();
    const events = await collect(migration().pipe(Stream.provide(empty.layer)));
    expect(events.at(-1)).toEqual({ _tag: 'Done', counts });

    // Never set up, as in a fresh environment: no contract and no rows.
    const absent = memory(oldBoard, { setUp: false });
    const next = memory(board);
    const layer = Layer.merge(absent.layer, next.layer);
    expect(
      (await collect(migration().pipe(Stream.provide(layer)))).at(-1),
    ).toEqual({
      _tag: 'Done',
      counts,
    });
    expect(Effect.runSync(readMigrationRow(next.store))?.value.state).toBe(
      'done',
    );
    expect(await collect(migration().pipe(Stream.provide(layer)))).toEqual([
      { _tag: 'Skipped' },
    ]);
  });

  it('refuses an old table set up under another declaration', async () => {
    // The same logical name, set up with one entity fewer than the code declares.
    const earlier = StdTable.make('board-v1')
      .primary('pk', 'sk')
      .entity(ProjectV1, (e) => e.primary())
      .build();
    const old = memory(earlier);
    const next = memory(board);

    const error = await failure(
      migration().pipe(Stream.provide(Layer.merge(old.layer, next.layer))),
    );

    expect((error as MigrationRefused).reason).toBe('source-changed');
    expect(Effect.runSync(readMigrationRow(next.store))).toBeUndefined();
  });

  it('refuses an old table holding rows but no contract', async () => {
    const old = memory(oldBoard, { setUp: false });
    const next = memory(board);
    const layer = Layer.merge(old.layer, next.layer);
    await Effect.runPromise(seed.pipe(Effect.provide(layer)));

    const error = await failure(migration().pipe(Stream.provide(layer)));

    expect((error as MigrationRefused).reason).toBe('source-changed');
  });

  it('refuses a new table that is not set up, set up under other code, or disposable', async () => {
    const old = memory(oldBoard);
    const absent = memory(board, { setUp: false });
    const error = await failure(
      migration().pipe(Stream.provide(Layer.merge(old.layer, absent.layer))),
    );
    expect((error as MigrationRefused).reason).toBe('target-not-set-up');

    const earlier = memory(
      StdTable.make('board')
        .primary('pk', 'sk')
        .entity(Project, (e) => e.primary())
        .build(),
    );
    const stale = await failure(
      migration().pipe(Stream.provide(Layer.merge(old.layer, earlier.layer))),
    );
    expect((stale as MigrationRefused).reason).toBe('target-not-set-up');

    const disposable = memory(board, { mode: 'disposable' });
    const refused = await failure(
      migration().pipe(
        Stream.provide(Layer.merge(old.layer, disposable.layer)),
      ),
    );
    expect((refused as MigrationRefused).reason).toBe('target-disposable');
    expect((refused as MigrationRefused).message).toMatch(/disposable/);
  });

  it('fails the run on a handler failure, leaves it running, and the next run clears the new table and completes', async () => {
    const { next, layer } = tables();
    await Effect.runPromise(seed.pipe(Effect.provide(layer)));
    const failing = StdTable.migrate(oldBoard, board, {
      ...handlers,
      Task: (task, tables) =>
        task.value.taskId === 't2'
          ? Effect.fail('no owner' as const)
          : handlers.Task(task, tables),
    });

    const error = await failure(failing.pipe(Stream.provide(layer)));

    expect(error).toBeInstanceOf(MigrationRowFailed);
    expect(error).toMatchObject({ entity: 'Task', cause: 'no owner' });
    expect((error as MigrationRowFailed).key.pk).toMatch(/p1/);
    expect(Effect.runSync(readMigrationRow(next.store))?.value).toMatchObject({
      state: 'running',
      attempt: 1,
    });
    expect(appRows(next.store).length).toBeGreaterThan(0);

    const events = await collect(migration().pipe(Stream.provide(layer)));

    expect(events[0]).toEqual({ _tag: 'Started', attempt: 2, restarted: true });
    expect(events.at(-1)).toMatchObject({ _tag: 'Done' });
    // Nothing from the failed attempt is left twice or left over.
    expect(appRows(next.store)).toHaveLength(2 + 3 + 3 + 1);
    expect(Effect.runSync(readMigrationRow(next.store))?.value).toMatchObject({
      state: 'done',
      attempt: 2,
    });
  });

  it('reports progress and records the counts after each page, with the old table size as the total', async () => {
    const { old, next } = tables();
    await Effect.runPromise(
      seed.pipe(Effect.provide(Layer.merge(old.layer, next.layer))),
    );
    const recorded: { state: string; read: number }[] = [];
    const watched: StdTableContract = {
      ...next.store,
      writeItem: (put) => {
        if (put.item.meta._e === '_std_migration') {
          const data = put.item.data as unknown as {
            state: string;
            counts: Record<string, { read: number }>;
          };
          recorded.push({
            state: data.state,
            read: Object.values(data.counts).reduce((n, c) => n + c.read, 0),
          });
        }
        return next.store.writeItem(put);
      },
    };
    const layer = Layer.merge(
      old.layer,
      Layer.succeed(StdTableService('board'), {
        contract: watched,
      } as StdTableService<'board'>),
    );

    const events = await collect(
      migration({ pageSize: 2 }).pipe(Stream.provide(layer)),
    );

    const progress = events.flatMap((event) =>
      event._tag === 'Progress' ? [event] : [],
    );
    expect(progress.length).toBeGreaterThan(2);
    // Seven app rows; the old table's contract rows are not counted.
    expect(progress.every(({ total }) => total === 7)).toBe(true);
    const reads = progress.map(({ read }) => read);
    expect(reads).toEqual([...reads].sort((a, b) => a - b));
    expect(progress.at(-1)).toMatchObject({ read: 7, written: 9 });
    // `running` once at the start and after each page but the last, then `done`.
    expect(recorded).toHaveLength(progress.length + 1);
    expect(recorded.map(({ read }) => read)).toEqual([0, ...reads]);
    expect(recorded.at(-1)?.state).toBe('done');
    expect(
      recorded.slice(0, -1).every(({ state }) => state === 'running'),
    ).toBe(true);
  });

  it('runs handlers one at a time by default, and several with concurrency', async () => {
    const peak = async (concurrency?: number) => {
      const { layer } = tables();
      await Effect.runPromise(seed.pipe(Effect.provide(layer)));
      let inFlight = 0;
      let most = 0;
      const slow = () =>
        Effect.gen(function* () {
          inFlight++;
          most = Math.max(most, inFlight);
          yield* Effect.sleep('5 millis');
          inFlight--;
        });
      await collect(
        StdTable.migrate(
          oldBoard,
          board,
          { Project: slow, Task: slow, Comment: slow, Prefs: slow },
          concurrency === undefined ? {} : { concurrency },
        ).pipe(Stream.provide(layer)),
      );
      return most;
    };
    expect(await peak()).toBe(1);
    expect(await peak(4)).toBe(4);
  });

  it('gives handlers strongly consistent reads of the old table', async () => {
    const { old, next } = tables();
    await Effect.runPromise(
      seed.pipe(Effect.provide(Layer.merge(old.layer, next.layer))),
    );
    const reads: (boolean | undefined)[] = [];
    const watched: StdTableContract = {
      ...old.store,
      getItem: (key, options) => {
        reads.push(options?.consistent);
        return old.store.getItem(key, options);
      },
    };
    const layer = Layer.merge(
      next.layer,
      Layer.succeed(StdTableService('board-v1'), {
        contract: watched,
      } as StdTableService<'board-v1'>),
    );
    reads.length = 0;

    await collect(migration().pipe(Stream.provide(layer)));

    // One project read per task, each strongly consistent.
    expect(reads.filter((read) => read === true).length).toBeGreaterThanOrEqual(
      3,
    );
    expect(reads).not.toContain(undefined);
  });

  it('never lets a handler write the old table', async () => {
    const { layer } = tables();
    await Effect.runPromise(seed.pipe(Effect.provide(layer)));
    const writing = StdTable.migrate(oldBoard, board, {
      ...handlers,
      Comment: (comment) =>
        oldBoard.Comment.delete({
          taskId: comment.value.taskId,
          commentId: comment.value.commentId,
        }),
    });

    const exit = await Effect.runPromise(
      Effect.exit(Stream.runDrain(writing.pipe(Stream.provide(layer)))),
    );

    expect(Exit.isFailure(exit) && exit.cause.reasons[0]?._tag).toBe('Die');
    const comment = await Effect.runPromise(
      oldBoard.Comment.get({ taskId: 't1', commentId: 'c1' }).pipe(
        Effect.provide(layer),
      ),
    );
    expect(comment?.meta._d).toBe(false);
  });

  it('drains a run with runMigration, returning the last event', async () => {
    const { layer } = tables();
    await Effect.runPromise(seed.pipe(Effect.provide(layer)));
    const done = await Effect.runPromise(
      StdTable.runMigration(migration()).pipe(Effect.provide(layer)),
    );
    expect(done._tag).toBe('Done');
    const skipped = await Effect.runPromise(
      StdTable.runMigration(migration()).pipe(Effect.provide(layer)),
    );
    expect(skipped._tag).toBe('Skipped');
  });

  it('types the handlers: one per old entity, each given its own row, and the old table read-only', () => {
    StdTable.migrate(oldBoard, board, {
      Project: (project, { old, next }) => {
        expectTypeOf(project).toEqualTypeOf<
          Entity<{ readonly projectId: string; readonly owner: string }>
        >();
        expectTypeOf(old.Project).toHaveProperty('get');
        expectTypeOf(old.Task).toHaveProperty('query');
        // @ts-expect-error the old table has no writes
        void old.Project.insert;
        expectTypeOf(next.Project).toHaveProperty('insert');
        return Effect.void;
      },
      Task: () => Effect.void,
      Comment: () => Effect.void,
      Prefs: (prefs) => {
        expectTypeOf(prefs).toEqualTypeOf<
          SingletonEntity<{ readonly theme: string }>
        >();
        return Effect.void;
      },
    });
    // @ts-expect-error every old entity needs a handler
    StdTable.migrate(oldBoard, board, {
      Project: () => Effect.void,
      Task: () => Effect.void,
      Prefs: () => Effect.void,
    });
    StdTable.migrate(oldBoard, board, {
      Project: () => Effect.void,
      Task: () => Effect.void,
      Comment: () => Effect.void,
      Prefs: () => Effect.void,
      // @ts-expect-error the old table has no such entity
      Activity: () => Effect.void,
    });
    // A row fails with its handler's error, or with a DatabaseError when it does not decode.
    expectTypeOf(
      StdTable.migrate(oldBoard, board, {
        Project: () => Effect.fail('no owner' as const),
        Task: () => Effect.void,
        Comment: () => Effect.void,
        Prefs: () => Effect.void,
      }),
    ).toEqualTypeOf<
      Stream.Stream<
        MigrationEvent,
        | MigrationRefused
        | MigrationRowFailed<'no owner' | DatabaseError>
        | DatabaseError
        | import('../../std-table/contract/index.js').OperationFailure,
        StdTableService<'board-v1'> | StdTableService<'board'>
      >
    >();
    expectTypeOf(migration()).toEqualTypeOf<
      Stream.Stream<
        MigrationEvent,
        MigrationError<DatabaseError>,
        StdTableService<'board-v1'> | StdTableService<'board'>
      >
    >();
  });
});
