import { Effect } from 'effect';
import * as Output from 'alchemy/Output';
import type * as Cloudflare from 'alchemy/Cloudflare';
import { expect, it, vi } from 'vitest';
import { StdTable } from '../../db/index.js';
import { makeNodeSQLite } from '../../db/sqlite/drivers/node/index.js';
import { TableSnapshot, TableSnapshotESchema } from '../../snapshot/index.js';
import type { DeployableTable } from '../snapshot-guard/index.js';

const { register } = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock('alchemy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('alchemy')>();
  const { Effect } = await import('effect');
  return {
    ...actual,
    Resource: () => (id: string, props: unknown) => {
      register(id, props);
      return Effect.succeed({ LogicalId: id, Props: props });
    },
  };
});
import { D1, reconcileD1Table } from '../d1/d1.js';

const stored = (table: DeployableTable) =>
  Effect.runSync(TableSnapshotESchema.encode(TableSnapshot.capture(table)));

it('registers one D1 table resource with the database dependency and snapshot', async () => {
  const table = StdTable.make('tasks').primary('pk', 'sk').build();
  const databaseId = Output.literal('db-1');
  const database = { databaseId } as unknown as Cloudflare.D1.Database;
  const resource = await Effect.runPromise(
    D1.table('TasksV2', {
      table,
      database,
      tableName: 'physical-tasks',
    }) as Effect.Effect<unknown>,
  );

  expect(register).toHaveBeenCalledTimes(1);
  expect(register.mock.calls[0]![0]).toBe('TasksV2');
  const props = register.mock.calls[0]![1];
  expect(props.databaseId).toBe(databaseId);
  expect(props.tableName).toBe('physical-tasks');
  expect(props.snapshot).toEqual(stored(table));
  expect(resource).toMatchObject({ LogicalId: 'TasksV2' });
});

it('checks an existing snapshot before opening D1 or changing its table', async () => {
  const oldTable = StdTable.make('tasks').primary('pk', 'sk').build();
  const changedTable = StdTable.make('tasks').primary('newPk', 'sk').build();
  const driver = makeNodeSQLite({ path: ':memory:' });
  const oldProps = {
    databaseId: 'db-1',
    tableName: 'physical-tasks',
    snapshot: stored(oldTable),
  };
  const changedProps = { ...oldProps, snapshot: stored(changedTable) };
  try {
    await Effect.runPromise(
      reconcileD1Table(oldProps, undefined, Effect.succeed(driver)),
    );
    let opened = false;
    await expect(
      Effect.runPromise(
        reconcileD1Table(
          changedProps,
          oldProps,
          Effect.sync(() => {
            opened = true;
            return driver;
          }),
        ),
      ),
    ).rejects.toThrow();
    expect(opened).toBe(false);

    await Effect.runPromise(
      reconcileD1Table(
        { ...changedProps, tableName: 'physical-tasks-v2' },
        oldProps,
        Effect.succeed(driver),
      ),
    );
    const oldColumns = await Effect.runPromise(
      driver.all('PRAGMA table_info("physical-tasks")'),
    );
    const newColumns = await Effect.runPromise(
      driver.all('PRAGMA table_info("physical-tasks-v2")'),
    );
    expect(oldColumns.some((column) => column.name === 'pk')).toBe(true);
    expect(newColumns.some((column) => column.name === 'newPk')).toBe(true);
  } finally {
    driver.close?.();
  }
});
