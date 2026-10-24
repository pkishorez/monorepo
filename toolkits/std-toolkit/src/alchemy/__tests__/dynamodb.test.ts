import { Effect } from 'effect';
import * as Output from 'alchemy/Output';
import { expect, it, vi } from 'vitest';
import { StdTable } from '../../db/index.js';
import type { DeployGuard } from '../deploy-guard/deploy-guard.js';

const { table, guard } = vi.hoisted(() => ({
  table: vi.fn((_id: string, props: { tableName: unknown }) =>
    Effect.succeed({ tableName: props.tableName }),
  ),
  guard: vi.fn(),
}));
vi.mock('@alchemy.run/aws/DynamoDB', () => ({ Table: table }));
vi.mock('../deploy-guard/index.js', () => ({ guardContract: guard }));
import { DynamoDB } from '../index.js';

const guardResource = {
  FQN: 'TasksDeployGuard',
  LogicalId: 'TasksDeployGuard',
} as unknown as DeployGuard;

it('guards the table before projecting its topology onto the resource', async () => {
  const hash = Output.map(Output.of(guardResource), () => 'hash');
  guard.mockImplementation(() => Effect.succeed({ hash }));
  const stdTable = StdTable.make('tasks')
    .primary('pk', 'sk')
    .lsi('byAlternate', 'alternate')
    .gsi('byOther', 'otherPk', 'otherSk')
    .build();

  const deploy = DynamoDB.table('Tasks', {
    table: stdTable,
    tableName: 'tasks-prod',
    mode: 'persistent',
  }) as Effect.Effect<unknown>;
  await Effect.runPromise(deploy);

  expect(guard).toHaveBeenCalledWith(
    'TasksDeployGuard',
    stdTable,
    'persistent',
    {
      target: 'tasks-prod',
      inPlaceOnly: true,
      localIndexOrder: ['byAlternate'],
    },
  );
  expect(guard.mock.invocationCallOrder[0]).toBeLessThan(
    table.mock.invocationCallOrder[0]!,
  );
  expect(table).toHaveBeenCalledWith('Tasks', {
    tableName: expect.anything(),
    partitionKey: 'pk',
    sortKey: 'sk',
    attributes: {
      pk: 'S',
      sk: 'S',
      alternate: 'S',
      otherPk: 'S',
      otherSk: 'S',
    },
    billingMode: 'PAY_PER_REQUEST',
    localSecondaryIndexes: [
      {
        indexName: 'byAlternate',
        sortKey: 'alternate',
        projection: { ProjectionType: 'ALL' },
      },
    ],
    globalSecondaryIndexes: [
      {
        indexName: 'byOther',
        partitionKey: 'otherPk',
        sortKey: 'otherSk',
        projection: { ProjectionType: 'ALL' },
      },
    ],
  });
  expect(Object.keys(Output.upstreamAny(table.mock.calls[0]![1]))).toEqual([
    'TasksDeployGuard',
  ]);
});

it('guards a disposable table in place only too', async () => {
  table.mockClear();
  const hash = Output.map(Output.of(guardResource), () => 'hash');
  guard.mockImplementation(() => Effect.succeed({ hash }));
  const stdTable = StdTable.make('prefs').primary('pk', 'sk').build();

  await Effect.runPromise(
    DynamoDB.table('Prefs', {
      table: stdTable,
      tableName: 'prefs-prod',
      mode: 'disposable',
    }) as Effect.Effect<unknown>,
  );

  expect(guard).toHaveBeenCalledWith(
    'PrefsDeployGuard',
    stdTable,
    'disposable',
    {
      target: 'prefs-prod',
      inPlaceOnly: true,
      localIndexOrder: [],
    },
  );
  expect(Object.keys(Output.upstreamAny(table.mock.calls[0]![1]))).toEqual([
    'TasksDeployGuard',
  ]);
});
