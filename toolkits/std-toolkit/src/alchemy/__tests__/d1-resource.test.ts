import { Effect, Exit, Schema } from 'effect';
import * as Output from 'alchemy/Output';
import type * as Cloudflare from '@alchemy.run/cloudflare';
import { expect, it, vi } from 'vitest';
import { EntityESchema } from '../../eschema/index.js';
import { StdTable } from '../../db/index.js';
import { makeNodeSQLite } from '../../db/sqlite/drivers/node/index.js';
import { SetupRefused, SQLite } from '../../db/sqlite/index.js';
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

const declare = async (
  id: string,
  options: Omit<Parameters<typeof D1.table>[1], 'database'>,
) =>
  (await Effect.runPromise(
    D1.table(id, {
      ...options,
      database: {
        databaseId: Output.literal('db-1'),
      } as unknown as Cloudflare.D1.Database,
    }) as Effect.Effect<unknown>,
  )) as { LogicalId: string; Props: Record<string, unknown> };

it('declares the mode and the snapshot, and carries the table for setup', async () => {
  const table = StdTable.make('tasks').primary('pk', 'sk').build();
  const resource = await declare('TasksV2', {
    table,
    tableName: 'physical-tasks',
    mode: 'persistent',
  });

  expect(resource.LogicalId).toBe('TasksV2');
  expect(resource.Props).toMatchObject({
    tableName: 'physical-tasks',
    mode: 'persistent',
    snapshot: stored(table),
  });
  expect((resource.Props.table as () => unknown)()).toBe(table);
  // State keeps plain data: the table function never reaches it.
  expect(JSON.parse(JSON.stringify(resource.Props))).not.toHaveProperty(
    'table',
  );
});

it('defaults the physical name to the logical name', async () => {
  const table = StdTable.make('prefs').primary('pk', 'sk').build();
  const resource = await declare('Prefs', { table, mode: 'disposable' });
  expect(resource.Props).toMatchObject({
    mode: 'disposable',
    tableName: 'prefs',
  });
});

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
}).build();
const TaskEdited = EntityESchema.make('Task', 'taskId', {
  title: Schema.String.check(Schema.isMaxLength(3)),
}).build();
const tasks = (schema: typeof TaskV1) =>
  StdTable.make('tasks')
    .primary('pk', 'sk')
    .entity(schema, (e) => e.primary())
    .build();

const props = (table: ReturnType<typeof tasks>) => ({
  databaseId: 'db-1',
  mode: 'persistent' as const,
  tableName: 'physical-tasks',
  snapshot: stored(table),
  table: () => table,
});

it('runs SQLite setup at deploy and returns plain attributes', async () => {
  const table = tasks(TaskV1);
  const driver = makeNodeSQLite({ path: ':memory:' });
  try {
    const attributes = await Effect.runPromise(
      setUpD1Table(props(table), Effect.succeed(driver)),
    );
    expect(attributes).toEqual({
      databaseId: 'db-1',
      mode: 'persistent',
      tableName: 'physical-tasks',
      snapshot: stored(table),
    });
    const columns = await Effect.runPromise(
      driver.all('PRAGMA table_info("physical-tasks")'),
    );
    expect(columns.some((column) => column.name === 'pk')).toBe(true);
  } finally {
    driver.close?.();
  }
});

it('fails the deploy with the SetupRefused message on a breaking change', async () => {
  const driver = makeNodeSQLite({ path: ':memory:' });
  try {
    const before = tasks(TaskV1);
    await Effect.runPromise(
      setUpD1Table(props(before), Effect.succeed(driver)),
    );
    await Effect.runPromise(
      before.Task.insert({ taskId: 't1', title: 'Write' }).pipe(
        Effect.provide(
          SQLite.make(before, {
            database: driver,
            tableName: 'physical-tasks',
          }).layer,
        ),
      ),
    );

    const exit = await Effect.runPromise(
      Effect.exit(
        setUpD1Table(props(tasks(TaskEdited)), Effect.succeed(driver)),
      ),
    );

    const error = Exit.isFailure(exit)
      ? exit.cause.reasons.find((reason) => reason._tag === 'Fail')?.error
      : undefined;
    expect(error).toBeInstanceOf(SetupRefused);
    expect((error as SetupRefused).message).toMatch(
      /persistent table "tasks" cannot be set up/,
    );
  } finally {
    driver.close?.();
  }
});
