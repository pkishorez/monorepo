import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';
import { StdTable } from '../../db/index.js';

const { table, guard } = vi.hoisted(() => ({
  table: vi.fn((_id: string, props: { tableName: string }) =>
    Effect.succeed({ tableName: props.tableName }),
  ),
  guard: vi.fn(() => Effect.succeed({})),
}));
vi.mock('alchemy/AWS/DynamoDB', () => ({ Table: table }));
vi.mock('../snapshot-guard/index.js', () => ({ guardTable: guard }));
import { DynamoDB } from '../index.js';

it('projects the topology onto the table resource, then guards that table', async () => {
  const stdTable = StdTable.make('tasks')
    .primary('pk', 'sk')
    .lsi('byAlternate', 'alternate')
    .gsi('byOther', 'otherPk', 'otherSk')
    .build();

  // Both resources are mocked, so no Alchemy provider is needed to run it.
  const deploy = DynamoDB.table('Tasks', {
    table: stdTable,
    tableName: 'tasks-prod',
  }) as Effect.Effect<unknown>;
  await Effect.runPromise(deploy);

  expect(table).toHaveBeenCalledWith('Tasks', {
    tableName: 'tasks-prod',
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
  expect(guard).toHaveBeenCalledWith('TasksSnapshot', {
    table: stdTable,
    target: 'tasks-prod',
  });
});
