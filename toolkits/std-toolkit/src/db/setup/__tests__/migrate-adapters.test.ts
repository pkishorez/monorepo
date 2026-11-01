import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Effect, Layer, Schema, Stream } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../index.js';
import { DynamoDB, type DynamoDBConfig } from '../../dynamodb/index.js';
import { IDB } from '../../idb/index.js';
import { SQLite } from '../../sqlite/index.js';
import { makeNodeSQLite } from '../../sqlite/drivers/node/index.js';
import type { StdTableService } from '../../std-table/contract/index.js';

// One migration, run against each real adapter: a task takes its owner
// from its project, read from the old table.

const ProjectV1 = EntityESchema.make('Project', 'projectId', {
  owner: Schema.String,
}).build();
const TaskV1 = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
}).build();
const oldBoard = StdTable.make('board-v1')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(ProjectV1, (e) => e.primary())
  .entity(TaskV1, (e) =>
    e
      .primary({ pk: ['projectId'] })
      .index('GSI1', 'byTitle', { pk: ['title'] }),
  )
  .build();

const Task = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
  owner: Schema.String,
}).build();
const board = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(Task, (e) =>
    e
      .primary({ pk: ['projectId'] })
      .index('GSI1', 'byOwner', { pk: ['owner'] }),
  )
  .build();

type Layers = Layer.Layer<
  StdTableService<'board-v1'> | StdTableService<'board'>
>;

const migration = StdTable.migrate(
  oldBoard,
  board,
  {
    Project: () => Effect.void,
    Task: (task, { old, next }) =>
      old.Project.get({ projectId: task.value.projectId }).pipe(
        Effect.flatMap((project) =>
          next.Task.insert({
            ...task.value,
            owner: project?.value.owner ?? 'nobody',
          }),
        ),
      ),
  },
  { concurrency: 4, pageSize: 3 },
);

const seed = Effect.gen(function* () {
  yield* oldBoard.Project.insert({ projectId: 'p1', owner: 'ada' });
  for (const n of [1, 2, 3, 4, 5])
    yield* oldBoard.Task.insert({
      projectId: 'p1',
      taskId: `t${n}`,
      title: `Task ${n}`,
    });
});

/** Seeds the old table, migrates, reads the new one back, and migrates again. */
const migrateOn = (layer: Layers) =>
  Effect.gen(function* () {
    yield* seed;
    const events = [...(yield* Stream.runCollect(migration))];
    const owned = yield* board.Task.query('byOwner', {
      pk: { owner: 'ada' },
      '>=': null,
    });
    const again = [...(yield* Stream.runCollect(migration))];
    return { events, owned: owned.items.length, again };
  }).pipe(Effect.provide(layer));

type Migrated =
  ReturnType<typeof migrateOn> extends Effect.Effect<infer A, any, any>
    ? A
    : never;

const expectMigrated = (result: Migrated) => {
  expect(result.events[0]).toEqual({
    _tag: 'Started',
    attempt: 1,
    restarted: false,
  });
  expect(result.events.at(-1)).toEqual({
    _tag: 'Done',
    counts: {
      Project: { read: 1, written: 0 },
      Task: { read: 5, written: 5 },
    },
  });
  expect(result.owned).toBe(5);
  expect(result.again).toEqual([{ _tag: 'Skipped' }]);
};

describe('StdTable.migrate on each adapter', () => {
  it('SQLite', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    try {
      await Effect.runPromise(
        Effect.all([
          SQLite.setup(oldBoard, { database, mode: 'persistent' }),
          SQLite.setup(board, { database, mode: 'persistent' }),
        ]),
      );
      const result = await Effect.runPromise(
        migrateOn(
          Layer.merge(
            SQLite.make(oldBoard, { database }).layer,
            SQLite.make(board, { database }).layer,
          ),
        ),
      );
      expectMigrated(result);
      // The total is the old table's app rows, its contract rows left out.
      const progress = result.events.find(({ _tag }) => _tag === 'Progress');
      expect(progress).toMatchObject({ total: 6 });
    } finally {
      database.close?.();
    }
  });

  it('IndexedDB', async () => {
    const database = IDB.database({
      databaseName: `migrate-${crypto.randomUUID()}`,
      indexedDB: new IDBFactory(),
    });
    const result = await Effect.runPromise(
      migrateOn(
        Layer.merge(
          IDB.make(oldBoard, { database, mode: 'persistent' }).layer,
          IDB.make(board, { database, mode: 'persistent' }).layer,
        ),
      ),
    );
    expectMigrated(result);
  });

  const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
  const dynamo = endpoint === undefined ? it.skip : it;
  const configs: DynamoDBConfig[] = [];
  afterAll(() =>
    Effect.runPromise(
      Effect.forEach(configs, (config) =>
        DynamoDB.deleteTable(config).pipe(Effect.ignore),
      ),
    ),
  );

  dynamo(
    'DynamoDB Local',
    async () => {
      const config = (name: string): DynamoDBConfig => {
        const made = {
          tableName: `migrate-${name}-${process.pid}-${Date.now()}`,
          region: 'local',
          endpoint: endpoint!,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        };
        configs.push(made);
        return made;
      };
      const from = config('old');
      const to = config('new');
      await Effect.runPromise(
        Effect.all([
          DynamoDB.setup(oldBoard, from, { mode: 'persistent' }),
          DynamoDB.setup(board, to, { mode: 'persistent' }),
        ]),
      );
      const result = await Effect.runPromise(
        migrateOn(
          Layer.merge(
            DynamoDB.make(oldBoard, from).layer,
            DynamoDB.make(board, to).layer,
          ),
        ),
      );
      expectMigrated(result);
    },
    60_000,
  );
});
