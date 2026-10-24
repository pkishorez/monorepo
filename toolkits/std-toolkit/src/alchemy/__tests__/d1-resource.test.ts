import { Effect } from 'effect';
import * as Output from 'alchemy/Output';
import type * as Cloudflare from '@alchemy.run/cloudflare';
import { expect, it, vi } from 'vitest';
import { StdTable } from '../../db/index.js';
import { makeNodeSQLite } from '../../db/sqlite/drivers/node/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import type { TableSource } from '../../snapshot/index.js';

const { guard } = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock('../deploy-guard/index.js', () => ({ guardContract: guard }));
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

it('guards a persistent table and feeds the guarded snapshot to the D1 table', async () => {
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
      mode: 'persistent',
    }) as Effect.Effect<unknown>,
  )) as { LogicalId: string; Props: Record<string, unknown> };

  expect(guard).toHaveBeenCalledWith(
    'TasksV2DeployGuard',
    table,
    'persistent',
    {
      target: expect.anything(),
    },
  );
  expect(resource.LogicalId).toBe('TasksV2');
  expect(resource.Props).toEqual({
    databaseId,
    tableName: 'physical-tasks',
    mode: 'persistent',
    snapshot: guardedSnapshot,
  });
});

it('gives a disposable table no deploy guard', async () => {
  guard.mockClear();
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

  expect(guard).not.toHaveBeenCalled();
  expect(resource.Props).toMatchObject({
    mode: 'disposable',
    tableName: 'prefs',
  });
  expect(resource.Props.snapshot).toEqual(stored(table));
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
