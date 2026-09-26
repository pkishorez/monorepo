import { Effect } from 'effect';
import * as Output from 'alchemy/Output';
import type * as Cloudflare from 'alchemy/Cloudflare';
import { expect, it, vi } from 'vitest';
import { StdTable } from '../../db/index.js';
import { makeNodeSQLite } from '../../db/sqlite/drivers/node/index.js';
import { TableSnapshot, TableSnapshotESchema } from '../../snapshot/index.js';
import type { TableSource } from '../../snapshot/index.js';

const { guard } = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock('../snapshot-guard/index.js', () => ({ guardTable: guard }));
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
  Effect.runSync(TableSnapshotESchema.encode(TableSnapshot.capture(table)));

it('guards the table and feeds the guarded snapshot to the D1 table', async () => {
  const table = StdTable.make('tasks').primary('pk', 'sk').build();
  const guardedSnapshot = Output.literal('guarded');
  guard.mockImplementation(() => Effect.succeed({ snapshot: guardedSnapshot }));
  const databaseId = Output.literal('db-1');
  const database = { databaseId } as unknown as Cloudflare.D1.Database;

  const resource = (await Effect.runPromise(
    D1.table('TasksV2', {
      table,
      database,
      tableName: 'physical-tasks',
    }) as Effect.Effect<unknown>,
  )) as { LogicalId: string; Props: Record<string, unknown> };

  expect(guard).toHaveBeenCalledWith('TasksV2Snapshot', {
    table,
    target: expect.anything(),
  });
  expect(resource.LogicalId).toBe('TasksV2');
  expect(resource.Props).toEqual({
    databaseId,
    tableName: 'physical-tasks',
    snapshot: guardedSnapshot,
  });
});

it('creates the table and indexes from the snapshot', async () => {
  const table = StdTable.make('tasks').primary('pk', 'sk').build();
  const driver = makeNodeSQLite({ path: ':memory:' });
  try {
    await Effect.runPromise(
      setUpD1Table(
        {
          databaseId: 'db-1',
          tableName: 'physical-tasks',
          snapshot: stored(table),
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
