import { Effect } from 'effect';
import * as Output from 'alchemy/Output';
import { expect, it, vi } from 'vitest';
import { StdTable } from '../../db/index.js';
import type { SnapshotGuard } from '../snapshot-guard/snapshot-guard.js';

const { table, guard } = vi.hoisted(() => ({
  table: vi.fn((_id: string, props: { tableName: unknown }) =>
    Effect.succeed({ tableName: props.tableName }),
  ),
  guard: vi.fn(),
}));
vi.mock('alchemy/AWS/DynamoDB', () => ({ Table: table }));
vi.mock('../snapshot-guard/index.js', () => ({ guardTable: guard }));
import { DynamoDB } from '../index.js';

it('guards the table before projecting its topology onto the resource', async () => {
  const guardResource = {
    FQN: 'TasksSnapshot',
    LogicalId: 'TasksSnapshot',
  } as unknown as SnapshotGuard;
  const snapshot = Output.map(Output.of(guardResource), () => 'snapshot');
  guard.mockImplementation(() => Effect.succeed({ snapshot }));
  const stdTable = StdTable.make('tasks')
    .primary('pk', 'sk')
    .lsi('byAlternate', 'alternate')
    .gsi('byOther', 'otherPk', 'otherSk')
    .build();

  const deploy = DynamoDB.table('Tasks', {
    table: stdTable,
    tableName: 'tasks-prod',
  }) as Effect.Effect<unknown>;
  await Effect.runPromise(deploy);

  expect(guard).toHaveBeenCalledWith('TasksSnapshot', {
    table: stdTable,
    target: 'tasks-prod',
  });
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
    'TasksSnapshot',
  ]);
});
