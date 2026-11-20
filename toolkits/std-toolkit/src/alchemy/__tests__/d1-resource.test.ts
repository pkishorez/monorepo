import { Effect, Schema } from 'effect';
import * as Output from 'alchemy/Output';
import type * as Cloudflare from '@alchemy.run/cloudflare';
import { expect, it, vi } from 'vitest';
import { StdTable } from '../../db/index.js';
import { EntityESchema } from '../../eschema/index.js';
import { makeNodeSQLite } from '../../db/sqlite/drivers/node/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import type { TableSource } from '../../snapshot/index.js';

vi.mock('alchemy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('alchemy')>();
  const { Effect } = await import('effect');
  return {
    ...actual,
    Resource: () => (id: string, props: unknown) =>
      Effect.succeed({ LogicalId: id, Props: props }),
  };
});
import { D1, setUpD1Table } from '../d1/d1.js';

const stored = (table: TableSource) =>
  Effect.runSync(TableSnapshot.serialize(TableSnapshot.capture(table)));

it.each(['persistent', 'disposable'] as const)(
  'declares a %s table with its snapshot and no deploy guard',
  async (mode) => {
    const table = StdTable.make('tasks').primary('pk', 'sk').build();
    const databaseId = Output.literal('db-1');
    const database = { databaseId } as unknown as Cloudflare.D1.Database;

    const resource = (await Effect.runPromise(
      D1.table('TasksV2', {
        table,
        database,
        tableName: 'physical-tasks',
        mode,
      }) as Effect.Effect<unknown>,
    )) as { LogicalId: string; Props: Record<string, unknown> };

    expect(resource.LogicalId).toBe('TasksV2');
    expect(resource.Props).toEqual({
      databaseId,
      tableName: 'physical-tasks',
      mode,
      snapshot: stored(table),
      localIndexOrder: [],
    });
  },
);

it('names the physical table after the StdTable by default', async () => {
  const table = StdTable.make('prefs').primary('pk', 'sk').build();
  const database = {
    databaseId: Output.literal('db-1'),
  } as unknown as Cloudflare.D1.Database;

  const resource = (await Effect.runPromise(
    D1.table('Prefs', {
      table,
      database,
      mode: 'disposable',
    }) as Effect.Effect<unknown>,
  )) as { Props: Record<string, unknown> };

  expect(resource.Props).toMatchObject({ tableName: 'prefs' });
});

it('creates the table and indexes from the snapshot', async () => {
  const table = StdTable.make('tasks').primary('pk', 'sk').build();
  const driver = makeNodeSQLite({ path: ':memory:' });
  try {
    await Effect.runPromise(
      setUpD1Table(
        {
          databaseId: 'db-1',
          mode: 'persistent',
          tableName: 'physical-tasks',
          snapshot: stored(table),
          localIndexOrder: [],
        },
        Effect.succeed(driver),
      ),
    );
    const columns = await Effect.runPromise(
      driver.all('PRAGMA table_info("physical-tasks")'),
    );
    expect(columns.some((column) => column.name === 'pk')).toBe(true);
  } finally {
    driver.close?.();
  }
});

it('refuses a persistent table a breaking change at deploy, against the snapshot it keeps', async () => {
  const tasks = (title: Schema.Codec<string, string>) => {
    const table = StdTable.make('tasks').primary('pk', 'sk').build();
    table
      .entity(EntityESchema.make('Task', 'taskId', { title }).build())
      .primary()
      .build();
    return table;
  };
  const props = (table: TableSource) => ({
    databaseId: 'db-1',
    mode: 'persistent' as const,
    tableName: 'tasks',
    snapshot: stored(table),
    localIndexOrder: [],
  });
  const driver = makeNodeSQLite({ path: ':memory:' });
  try {
    await Effect.runPromise(
      setUpD1Table(props(tasks(Schema.String)), Effect.succeed(driver)),
    );
    const recorded = await Effect.runPromise(
      driver.all("SELECT count(*) AS n FROM tasks WHERE _e = '__snapshot'"),
    );
    expect(recorded).toEqual([{ n: 1 }]);

    const result = await Effect.runPromise(
      setUpD1Table(
        props(tasks(Schema.String.check(Schema.isMaxLength(3)))),
        Effect.succeed(driver),
      ).pipe(Effect.result),
    );
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'SetupRefused', reason: 'breaking' },
    });
  } finally {
    driver.close?.();
  }
});

it('keeps the local secondary indexes in declared order in __snapshot', async () => {
  const table = StdTable.make('tasks')
    .primary('pk', 'sk')
    .lsi('LSI2', 'LSI2SK')
    .lsi('LSI1', 'LSI1SK')
    .build();
  const database = {
    databaseId: Output.literal('db-1'),
  } as unknown as Cloudflare.D1.Database;
  const resource = (await Effect.runPromise(
    D1.table('Tasks', { table, database, mode: 'persistent' }) as Effect.Effect<
      unknown,
      never
    >,
  )) as { Props: Parameters<typeof setUpD1Table>[0] };
  expect(resource.Props.localIndexOrder).toEqual(['LSI2', 'LSI1']);

  const driver = makeNodeSQLite({ path: ':memory:' });
  try {
    await Effect.runPromise(
      setUpD1Table(
        { ...resource.Props, databaseId: 'db-1' },
        Effect.succeed(driver),
      ),
    );
    const [row] = await Effect.runPromise(
      driver.all("SELECT * FROM tasks WHERE _e = '__snapshot'"),
    );
    const data = Object.values(row!).find(
      (value) =>
        typeof value === 'string' && value.includes('localSecondaryIndexes'),
    ) as string;
    expect(
      (
        JSON.parse(data) as {
          localSecondaryIndexes: readonly { name: string }[];
        }
      ).localSecondaryIndexes.map(({ name }) => name),
    ).toEqual(['LSI2', 'LSI1']);
  } finally {
    driver.close?.();
  }
});
