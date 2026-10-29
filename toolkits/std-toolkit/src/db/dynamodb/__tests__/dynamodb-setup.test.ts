import { type Duration, Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { Memory } from '../../memory/index.js';
import { SetupRefused, type TableMode } from '../../setup/index.js';
import {
  contractLayer,
  StdTableService,
  type ReadOptions,
  type StdTableContract,
  type StoredItem,
} from '../../std-table/contract/index.js';
import { encodeCompositeKey } from '../../std-table/key/index.js';
import { StdTable } from '../../std-table/table/index.js';
import type { DynamoDBClient } from '../client/index.js';
import {
  ensureDynamoTable,
  GlobalIndexNotReady,
  setUpDynamoTable,
} from '../setup/index.js';

const NAME = 'board';
const TABLE_NAME = 'board-prod';

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
const TaskEdited = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.Finite,
}).build();

const plainTable = () =>
  StdTable.make(NAME)
    .primary('pk', 'sk')
    .entity(TaskV1, (e) => e.primary({ pk: ['projectId'] }))
    .build();

const indexedTable = () =>
  StdTable.make(NAME)
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .entity(TaskV1, (e) =>
      e
        .primary({ pk: ['projectId'] })
        .index('GSI1', 'byTitle', { pk: ['title'] }),
    )
    .backfill('task-by-title', { reindex: 'Task' })
    .build();

const createdIndexed = () =>
  StdTable.make(NAME)
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .entity(TaskV1, (e) =>
      e
        .primary({ pk: ['projectId'] })
        .index('GSI1', 'byTitle', { pk: ['title'] }),
    )
    .build();

const gapTable = () =>
  StdTable.make(NAME)
    .primary('pk', 'sk')
    .entity(TaskV2, (e) => e.primary({ pk: ['projectId'] }))
    .backfill('task-owner', {
      entity: 'Task',
      to: 'v2',
      run: (task) => Effect.succeed({ ...task, owner: 'ann' }),
    })
    .build();

const editedTable = () =>
  StdTable.make(NAME)
    .primary('pk', 'sk')
    .entity(TaskEdited, (e) => e.primary({ pk: ['projectId'] }))
    .build();

/**
 * One physical table: a fake client for the table itself (create, describe,
 * update) and a Memory store for its rows, with every step logged in order.
 */
const physicalTable = () => {
  const log: string[] = [];
  const indexes = new Set<string>();
  // Describes left before an index started by an earlier deploy is ACTIVE.
  const creating = new Map<string, number>();
  // A status an index keeps on every describe, and indexes that never appear.
  const stuck = new Map<string, string>();
  const vanishing = new Set<string>();
  let exists = false;
  const inner = Effect.runSync(
    Effect.map(StdTableService(NAME), ({ contract }) => contract).pipe(
      Effect.provide(Memory.make(indexedTable()).layer),
    ),
  );
  const reads: (ReadOptions | undefined)[] = [];
  const counts = { queries: 0, scans: 0 };
  const store: StdTableContract = {
    ...inner,
    getItem: (key, options) => (
      reads.push(options),
      inner.getItem(key, options)
    ),
    queryItems: (request) => (counts.queries++, inner.queryItems(request)),
    scanItems: (request) => (counts.scans++, inner.scanItems(request)),
    writeItem: (put) => {
      if (put.item.meta._e === 'Task') log.push(`write ${put.item.meta._e}`);
      return inner.writeItem(put);
    },
  };
  const client = {
    createTable: (input: {
      GlobalSecondaryIndexes?: { IndexName: string }[];
    }) =>
      Effect.suspend(() => {
        log.push('createTable');
        if (exists) return Effect.fail({ _tag: 'ResourceInUseException' });
        exists = true;
        for (const index of input.GlobalSecondaryIndexes ?? [])
          indexes.add(index.IndexName);
        return Effect.succeed({});
      }),
    describeTable: () =>
      Effect.sync(() => ({
        Table: {
          TableStatus: 'ACTIVE',
          GlobalSecondaryIndexes: [...indexes].map((IndexName) => {
            const status = stuck.get(IndexName);
            if (status !== undefined) return { IndexName, IndexStatus: status };
            const left = creating.get(IndexName) ?? 0;
            if (left === 0) return { IndexName, IndexStatus: 'ACTIVE' };
            creating.set(IndexName, left - 1);
            log.push(`describe ${IndexName} creating`);
            return { IndexName, IndexStatus: 'CREATING', Backfilling: true };
          }),
        },
      })),
    updateTable: (input: {
      GlobalSecondaryIndexUpdates: { Create: { IndexName: string } }[];
    }) =>
      Effect.sync(() => {
        for (const { Create } of input.GlobalSecondaryIndexUpdates) {
          log.push(`updateTable create ${Create.IndexName}`);
          if (!vanishing.has(Create.IndexName)) indexes.add(Create.IndexName);
        }
        return {};
      }),
  } as unknown as DynamoDBClient;
  const setUp = (table: AnyTable, mode: TableMode = 'persistent') =>
    Effect.runPromise(
      setUpDynamoTable({ client, table, tableName: TABLE_NAME, mode, store }),
    );
  const refusal = (
    table: AnyTable,
    mode: TableMode = 'persistent',
    indexWait?: Duration.Input,
  ) =>
    Effect.runPromise(
      Effect.flip(
        setUpDynamoTable({
          client,
          table,
          tableName: TABLE_NAME,
          mode,
          store,
          ...(indexWait === undefined ? {} : { indexWait }),
        }),
      ),
    );
  const insert = (taskIds: readonly string[]) =>
    Effect.runPromise(
      Effect.forEach(
        taskIds,
        (taskId) =>
          plainTable().Task.insert({
            taskId,
            projectId: 'p1',
            title: `t ${taskId}`,
          }),
        { discard: true },
      ).pipe(Effect.provide(contractLayer(NAME, store))),
    );
  const items = () =>
    Effect.runPromise(
      Effect.map(inner.scanItems({ limit: 1000 }), ({ items }) => items),
    );
  const reset = () => {
    log.length = 0;
    reads.length = 0;
    counts.queries = 0;
    counts.scans = 0;
  };
  /** An index a deploy that stopped started creating. */
  const startIndex = (name: string, describes: number) => {
    indexes.add(name);
    creating.set(name, describes);
  };
  return {
    log,
    indexes,
    startIndex,
    stuck,
    vanishing,
    reads,
    counts,
    store,
    setUp,
    refusal,
    insert,
    items,
    reset,
  };
};

type AnyTable = Parameters<typeof setUpDynamoTable>[0]['table'];

const tasksOf = (items: readonly StoredItem[]) =>
  items.filter(({ meta }) => meta._e === 'Task');

const tableRow = (store: StdTableContract) =>
  Effect.runPromise(
    store.getItem({
      pk: encodeCompositeKey(['_std_contract']),
      sk: encodeCompositeKey(['table']),
    }),
  );

describe('DynamoDB setup', () => {
  it('creates a fresh table with its full topology and records the contract', async () => {
    const physical = physicalTable();

    const outcome = await physical.setUp(indexedTable());

    expect(outcome).toEqual({ kind: 'created' });
    expect(physical.log).toEqual(['createTable']);
    expect([...physical.indexes]).toEqual(['GSI1']);
    expect(await tableRow(physical.store)).not.toBeNull();
  });

  it('reads an unchanged table once, consistently, and changes nothing', async () => {
    const physical = physicalTable();
    await physical.setUp(plainTable());
    physical.reset();

    const outcome = await physical.setUp(plainTable());

    expect(outcome).toEqual({ kind: 'unchanged' });
    expect(physical.reads).toEqual([{ consistent: true }]);
    expect(physical.counts).toEqual({ queries: 0, scans: 0 });
    expect(physical.log).toEqual(['createTable']);
  });

  it('adds a new global secondary index in place, then reindexes into it', async () => {
    const physical = physicalTable();
    await physical.setUp(plainTable());
    await physical.insert(['a', 'b']);
    physical.reset();

    const outcome = await physical.setUp(indexedTable());

    expect(outcome).toMatchObject({
      kind: 'applied',
      backfills: ['task-by-title'],
    });
    expect(physical.log).toEqual([
      'createTable',
      'updateTable create GSI1',
      'write Task',
      'write Task',
    ]);
    expect(
      tasksOf(await physical.items()).map(({ keys }) => keys.GSI1PK),
    ).toEqual([expect.any(String), expect.any(String)]);
  });

  it('waits for an index a stopped deploy left creating before reindexing into it', async () => {
    const physical = physicalTable();
    await physical.setUp(plainTable());
    await physical.insert(['a', 'b']);
    // The last deploy started GSI1, then stopped before recording a contract.
    physical.startIndex('GSI1', 2);
    physical.reset();

    const outcome = await physical.setUp(indexedTable());

    expect(outcome).toMatchObject({
      kind: 'applied',
      backfills: ['task-by-title'],
    });
    expect(physical.log).toEqual([
      'createTable',
      'describe GSI1 creating',
      'describe GSI1 creating',
      'write Task',
      'write Task',
    ]);
  });

  const indexFailure = async (
    prepare: (physical: ReturnType<typeof physicalTable>) => void,
    indexWait?: Duration.Input,
  ) => {
    const physical = physicalTable();
    await physical.setUp(plainTable());
    await physical.insert(['a']);
    const before = await tableRow(physical.store);
    prepare(physical);
    physical.reset();
    const failure = (await physical.refusal(
      indexedTable(),
      'persistent',
      indexWait,
    )) as { readonly cause?: unknown };
    // Nothing was recorded: the next deploy finds the old contract.
    expect(await tableRow(physical.store)).toEqual(before);
    expect(physical.log).not.toContain('write Task');
    return failure.cause as GlobalIndexNotReady;
  };

  it('fails at once on an index that is being deleted', async () => {
    const cause = await indexFailure((physical) => {
      physical.startIndex('GSI1', 0);
      physical.stuck.set('GSI1', 'DELETING');
    });
    expect(cause).toBeInstanceOf(GlobalIndexNotReady);
    expect(cause.state).toBe('DELETING');
  });

  it('keeps waiting on an index that is updating, as it returns to active', async () => {
    const cause = await indexFailure(
      (physical) => physical.stuck.set('GSI1', 'UPDATING'),
      '50 millis',
    );
    expect(cause).toBeInstanceOf(GlobalIndexNotReady);
    expect(cause.state).toBe('timed-out');
  });

  it('fails at once on an index missing after it was created', async () => {
    const cause = await indexFailure((physical) =>
      physical.vanishing.add('GSI1'),
    );
    expect(cause).toBeInstanceOf(GlobalIndexNotReady);
    expect(cause.state).toBe('missing');
  });

  it('stops waiting for an index still creating after the wait', async () => {
    const cause = await indexFailure(
      (physical) => physical.stuck.set('GSI1', 'CREATING'),
      '50 millis',
    );
    expect(cause).toBeInstanceOf(GlobalIndexNotReady);
    expect(cause.state).toBe('timed-out');
    expect(cause.message).toContain('still creating');
  });

  it('refuses removing a global secondary index, in either mode', async () => {
    for (const mode of ['persistent', 'disposable'] as const) {
      const physical = physicalTable();
      // Created with its index, so it ships no Backfill: one dropped would
      // read as older code.
      await physical.setUp(createdIndexed(), mode);
      await physical.insert(['a']);

      const error = await physical.refusal(plainTable(), mode);

      expect(error).toBeInstanceOf(SetupRefused);
      expect((error as SetupRefused).reason).toBe('replaces-table');
      expect(tasksOf(await physical.items())).toHaveLength(1);
    }
  });

  it('refuses a new local secondary index', async () => {
    const physical = physicalTable();
    await physical.setUp(plainTable());

    const error = await physical.refusal(
      StdTable.make(NAME)
        .primary('pk', 'sk')
        .lsi('LSI1', 'LSI1SK')
        .entity(TaskV1, (e) => e.primary({ pk: ['projectId'] }))
        .build(),
    );

    expect((error as SetupRefused).reason).toBe('replaces-table');
  });

  it('fills a gap version with its Backfill', async () => {
    const physical = physicalTable();
    await physical.setUp(plainTable());
    await physical.insert(['a', 'b']);

    const outcome = await physical.setUp(gapTable());

    expect(outcome).toMatchObject({
      kind: 'applied',
      backfills: ['task-owner'],
    });
    expect(
      tasksOf(await physical.items()).map(({ data }) => [
        data._v,
        (data as { owner?: unknown }).owner,
      ]),
    ).toEqual([
      ['v2', 'ann'],
      ['v2', 'ann'],
    ]);
  });

  it('wipes a disposable table on a change its rows cannot take', async () => {
    const physical = physicalTable();
    await physical.setUp(plainTable(), 'disposable');
    await physical.insert(['a', 'b']);

    const outcome = await physical.setUp(editedTable(), 'disposable');

    expect(outcome.kind).toBe('wiped');
    expect(tasksOf(await physical.items())).toEqual([]);
    expect(await tableRow(physical.store)).not.toBeNull();
  });
});

describe('DynamoDB createTable', () => {
  const table = StdTable.make('people')
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .build();

  const activeClient = (
    createTable: (input: unknown) => Effect.Effect<unknown, unknown>,
  ) =>
    ({
      createTable,
      describeTable: () => Effect.succeed({ Table: { TableStatus: 'ACTIVE' } }),
    }) as unknown as DynamoDBClient;

  it('creates a missing table with the projected topology', async () => {
    const requests: unknown[] = [];
    const client = activeClient((input) => {
      requests.push(input);
      return Effect.succeed({});
    });

    await Effect.runPromise(ensureDynamoTable(client, table, 'people-table'));

    expect(requests).toEqual([
      expect.objectContaining({
        TableName: 'people-table',
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
      }),
    ]);
  });

  it('leaves an existing table as it is', async () => {
    const client = activeClient(() =>
      Effect.fail({ _tag: 'ResourceInUseException' }),
    );

    await expect(
      Effect.runPromise(ensureDynamoTable(client, table, 'people-table')),
    ).resolves.toBeUndefined();
  });

  it('waits until the table is ACTIVE before returning', async () => {
    let described = 0;
    const client = {
      createTable: () => Effect.succeed({}),
      describeTable: () =>
        Effect.sync(() => ({
          Table: { TableStatus: ++described < 3 ? 'CREATING' : 'ACTIVE' },
        })),
    } as unknown as DynamoDBClient;

    await Effect.runPromise(ensureDynamoTable(client, table, 'people-table'));

    expect(described).toBe(3);
  });

  it('retains a setup failure cause', async () => {
    const cause = new Error('denied');
    const client = activeClient(() => Effect.fail(cause));

    const result = await Effect.runPromise(
      ensureDynamoTable(client, table, 'people-table').pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { operation: 'setup', cause },
    });
  });
});
