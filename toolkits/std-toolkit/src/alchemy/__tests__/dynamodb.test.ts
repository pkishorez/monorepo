import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';
import { StdTable } from '../../db/index.js';
import { SetupRefused } from '../../db/setup/index.js';

const { setup } = vi.hoisted(() => ({ setup: vi.fn() }));
vi.mock('../../db/dynamodb/index.js', () => ({ DynamoDB: { setup } }));
vi.mock('alchemy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('alchemy')>();
  const { Effect } = await import('effect');
  return {
    ...actual,
    Resource: () => (id: string, props: unknown) =>
      Effect.succeed({ LogicalId: id, Props: props }),
  };
});
import {
  diffDynamoDBTable,
  DynamoDB,
  setUpDynamoDBTable,
} from '../dynamodb/dynamodb.js';

type Props = Parameters<typeof setUpDynamoDBTable>[0];

const tasks = StdTable.make('tasks').primary('pk', 'sk').build();
const credentials = { accessKeyId: 'key', secretAccessKey: 'secret' };

const declare = async (table = tasks, tableName = 'tasks-prod') =>
  (
    (await Effect.runPromise(
      DynamoDB.table('Tasks', {
        table,
        tableName,
        mode: 'persistent',
        region: 'eu-west-1',
        credentials,
      }) as Effect.Effect<unknown>,
    )) as { LogicalId: string; Props: Props }
  ).Props;

it('declares one resource that carries the table and its contract hash, not a deploy guard', async () => {
  const props = await declare();
  expect(props).toMatchObject({
    tableName: 'tasks-prod',
    region: 'eu-west-1',
    mode: 'persistent',
    hash: expect.any(String),
  });
  expect(props.table()).toBe(tasks);
  expect(props.credentials()).toBe(credentials);
  // Only the attributes reach state: the table and credentials are functions.
  expect(Object.keys(JSON.parse(JSON.stringify(props))).sort()).toEqual([
    'hash',
    'mode',
    'region',
    'tableName',
  ]);
});

it('runs DynamoDB setup at deploy with the table itself', async () => {
  setup.mockReset();
  setup.mockImplementation(() => Effect.succeed({ kind: 'created' }));
  const props = await declare();

  const output = await Effect.runPromise(setUpDynamoDBTable(props, undefined));

  expect(setup).toHaveBeenCalledWith(
    tasks,
    { tableName: 'tasks-prod', region: 'eu-west-1', credentials },
    { mode: 'persistent' },
  );
  expect(output).toEqual({
    tableName: 'tasks-prod',
    region: 'eu-west-1',
    mode: 'persistent',
    hash: props.hash,
  });
});

it('fails the deploy with the refusal setup gives', async () => {
  const refused = new SetupRefused('tasks', 'replaces-table');
  setup.mockReset();
  setup.mockImplementation(() => Effect.fail(refused));
  const props = await declare();

  const error = await Effect.runPromise(
    Effect.flip(setUpDynamoDBTable(props, undefined)),
  );

  expect(error).toBe(refused);
});

it('refuses a new physical name under the same resource before setup runs', async () => {
  setup.mockReset();
  const before = await declare(tasks, 'tasks-a');
  const after = await declare(tasks, 'tasks-b');

  const error = await Effect.runPromise(
    Effect.flip(
      setUpDynamoDBTable(after, {
        tableName: before.tableName,
        region: before.region,
        mode: before.mode,
        hash: before.hash,
      }),
    ),
  );

  expect((error as SetupRefused).reason).toBe('renames-table');
  expect(setup).not.toHaveBeenCalled();
});

it('sets up again only when the contract changes', async () => {
  const before = await declare();
  const same = await declare();
  const changed = await declare(
    StdTable.make('tasks')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build(),
  );

  expect(diffDynamoDBTable(before, same)).toEqual({ action: 'noop' });
  expect(diffDynamoDBTable(before, changed)).toEqual({ action: 'update' });
});
