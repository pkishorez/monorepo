import { Effect } from 'effect';
import * as Output from 'alchemy/Output';
import { beforeEach, expect, it, vi } from 'vitest';
import { StdTable } from '../../db/index.js';
import { TableSnapshot } from '../../snapshot/index.js';

// Each fake resource's `tableName` is an output of the resource itself, so a
// resource fed it is ordered after the one it came from.
const { declared, fakeResource } = vi.hoisted(() => {
  const declared: { id: string; props: Record<string, unknown> }[] = [];
  const fakeResource = async () => {
    const { Effect } = await import('effect');
    const Output = await import('alchemy/Output');
    return (id: string, props: Record<string, unknown>) =>
      Effect.sync(() => {
        declared.push({ id, props });
        const self = { FQN: id, LogicalId: id } as never;
        return {
          tableName: Output.map(Output.of(self), () => props.tableName),
        };
      });
  };
  return { declared, fakeResource };
});
vi.mock('@alchemy.run/aws/DynamoDB', async () => ({
  Table: await fakeResource(),
}));
vi.mock('alchemy', async (importOriginal) => {
  const resource = await fakeResource();
  return {
    ...(await importOriginal<typeof import('alchemy')>()),
    Resource: () => resource,
  };
});
import { DynamoDB } from '../index.js';

const upstream = (value: unknown) => Object.keys(Output.upstreamAny(value));

beforeEach(() => {
  declared.length = 0;
});

it('checks the snapshot before the table and records it after', async () => {
  const stdTable = StdTable.make('tasks')
    .primary('pk', 'sk')
    .lsi('byAlternate', 'alternate')
    .lsi('byEarlier', 'earlier')
    .gsi('byOther', 'otherPk', 'otherSk')
    .build();

  await Effect.runPromise(
    DynamoDB.table('Tasks', {
      table: stdTable,
      tableName: 'tasks-prod',
      mode: 'persistent',
    }) as Effect.Effect<unknown>,
  );

  const snapshot = Effect.runSync(
    TableSnapshot.serialize(TableSnapshot.capture(stdTable)),
  );
  const props = {
    mode: 'persistent',
    snapshot,
    localIndexOrder: ['byAlternate', 'byEarlier'],
  };
  const [check, dynamoTable, record] = declared;
  expect(declared.map(({ id }) => id)).toEqual([
    'TasksSnapshotCheck',
    'Tasks',
    'TasksSnapshotRecord',
  ]);
  expect(check!.props).toEqual({ ...props, tableName: 'tasks-prod' });
  expect(upstream(dynamoTable!.props.tableName)).toEqual([
    'TasksSnapshotCheck',
  ]);
  expect(record!.props).toEqual({ ...props, tableName: expect.anything() });
  expect(upstream(record!.props.tableName)).toEqual(['Tasks']);
});

it("projects the table's topology onto Alchemy's table", async () => {
  const stdTable = StdTable.make('tasks')
    .primary('pk', 'sk')
    .lsi('byAlternate', 'alternate')
    .gsi('byOther', 'otherPk', 'otherSk')
    .build();

  await Effect.runPromise(
    DynamoDB.table('Tasks', {
      table: stdTable,
      tableName: 'tasks-prod',
      mode: 'disposable',
    }) as Effect.Effect<unknown>,
  );

  expect(declared[1]!.props).toEqual({
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
});
