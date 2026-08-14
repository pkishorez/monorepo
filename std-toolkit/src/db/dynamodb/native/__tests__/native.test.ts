import { Effect, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Broadcaster, Ulid, type EntityType } from '../../../../core/index.js';
import { EntityESchema } from '../../../../eschema/index.js';
import { StdTable } from '../../../std-table/table/index.js';
import type { DynamoDBClient } from '../../client/index.js';
import type { EncodedItem } from '../../../std-table/contract/index.js';
import type {
  BatchWriteItemInput,
  GetItemInput,
  UpdateItemInput,
} from '../../client/generated/types.js';
import { exprCondition } from '../../expression/index.js';
import { itemSchema, type DecodedItem } from '../../item-schema/index.js';
import type { TableDefinition } from '../../../std-table/definition/index.js';

type TableIndexes = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;
const encodeItem = (table: TableIndexes, item: EncodedItem): DecodedItem =>
  Schema.decodeSync(itemSchema(table))(item);
import { batchInsert, getItem, makeNativeService, update } from '../native.js';

type Counter = {
  readonly count: number;
  readonly status: string;
};

const counterTable = StdTable.make('people')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
const counterSchema = EntityESchema.make('Counter', 'counterId', {
  count: Schema.Number,
  status: Schema.String,
}).build();
const counter = counterTable
  .entity(counterSchema)
  .primary({ pk: [] })
  .index('GSI1', 'byStatus', { pk: ['status'] })
  .build();

const makeRecordingClient = () => {
  const updates: UpdateItemInput[] = [];
  const batches: BatchWriteItemInput[] = [];
  const gets: GetItemInput[] = [];
  const client = new Proxy({} as DynamoDBClient, {
    get: (_target, property) => {
      if (property === 'updateItem')
        return (input: UpdateItemInput) => {
          updates.push(input);
          return Effect.succeed({
            Attributes: encodeItem(counterTable, {
              pk: '7:Counter',
              sk: '1:1',
              meta: {
                _e: 'Counter',
                _v: 'v1',
                _u: '00000000000000000000000001',
                _d: false,
              },
              data: {
                _v: 'v1',
                counterId: '1',
                count: 2,
                status: 'active',
              },
              keys: {},
            }),
          });
        };
      if (property === 'batchWriteItem')
        return (input: BatchWriteItemInput) => {
          batches.push(input);
          return Effect.succeed({});
        };
      if (property === 'getItem')
        return (input: GetItemInput) => {
          gets.push(input);
          return Effect.succeed({
            Item: encodeItem(counterTable, {
              pk: 'Counter',
              sk: '1',
              meta: {
                _e: 'Counter',
                _v: 'v1',
                _u: '00000000000000000000000000',
                _d: false,
              },
              data: {
                _v: 'v1',
                counterId: '1',
                count: 1,
                status: 'active',
              },
              keys: {},
            }),
          });
        };
      return undefined;
    },
  });
  return { client, updates, batches, gets };
};

describe('DynamoDB native operations', () => {
  it('supports an explicitly consistent native read', async () => {
    const recording = makeRecordingClient();
    const layer = makeNativeService('people', recording.client, 'people-table');

    await Effect.runPromise(
      getItem(
        'people',
        { pk: 'person', sk: '1' },
        { consistentRead: true },
      ).pipe(Effect.provide(layer)),
    );

    expect(recording.gets).toEqual([
      {
        TableName: 'people-table',
        Key: { pk: { S: 'person' }, sk: { S: '1' } },
        ConsistentRead: true,
      },
    ]);
  });

  it('translates typed update and condition expressions into UpdateItem', async () => {
    const recording = makeRecordingClient();
    const layer = makeNativeService('people', recording.client, 'people-table');
    const broadcasts: EntityType<object>[] = [];
    const broadcaster = Layer.succeed(Broadcaster, {
      broadcast: (entities) => broadcasts.push(...entities),
    });

    const result = await Effect.runPromise(
      update(counter, {
        key: { counterId: '1' },
        update: ($) => [$.set('count', $.opAdd('count', 1))],
        condition: exprCondition<Counter>(($) =>
          $.cond('status', '=', 'active'),
        ),
      }).pipe(
        Effect.provide(Layer.merge(layer, broadcaster)),
        Effect.provideService(Ulid, () => '00000000000000000000000001'),
      ),
    );

    expect(recording.updates).toHaveLength(1);
    expect(recording.updates[0]).toMatchObject({
      TableName: 'people-table',
      Key: { pk: { S: 'Counter' }, sk: { S: '1' } },
      ReturnValues: 'ALL_NEW',
      UpdateExpression:
        'SET #u_attr_1.#u_attr_2 = #u_attr_3.#u_attr_4 + :u_value_5, #u_attr_6 = :u_value_7, #u_attr_8 = :u_value_9, #u_attr_10 = :u_value_11',
      ConditionExpression:
        '#cf_attr_1 = :cf_value_2 AND #cf_attr_3.#cf_attr_4 = :cf_value_5',
    });
    expect(
      Object.values(recording.updates[0]?.ExpressionAttributeNames ?? {}),
    ).toEqual(expect.arrayContaining(['GSI1PK', 'GSI1SK']));
    expect(
      Object.values(recording.updates[0]?.ExpressionAttributeValues ?? {}),
    ).toEqual(
      expect.arrayContaining([
        { S: 'Counter#active' },
        { S: '00000000000000000000000001' },
      ]),
    );
    expect(result.value.count).toBe(2);
    expect(result.meta._u).toBe('00000000000000000000000001');
    expect(broadcasts).toEqual([result]);
  });

  it('rejects expression updates to index-derived fields', async () => {
    const recording = makeRecordingClient();
    const layer = makeNativeService('people', recording.client, 'people-table');

    const result = await Effect.runPromise(
      update(counter, {
        key: { counterId: '1' },
        update: ($) => [$.set('status', 'inactive')],
      }).pipe(
        Effect.provide(layer),
        Effect.provideService(Ulid, () => '00000000000000000000000001'),
        Effect.result,
      ),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { operation: 'update' },
    });
    expect(recording.updates).toEqual([]);
  });

  it('marshals batches without exceeding the native 25-write limit', async () => {
    const recording = makeRecordingClient();
    const layer = makeNativeService('people', recording.client, 'people-table');

    await Effect.runPromise(
      batchInsert(
        'people',
        Array.from({ length: 26 }, (_, index) => ({
          pk: 'person',
          sk: String(index),
        })),
      ).pipe(Effect.provide(layer)),
    );

    expect(recording.batches).toHaveLength(2);
    expect(recording.batches[0]?.RequestItems['people-table']).toHaveLength(25);
    expect(recording.batches[1]?.RequestItems['people-table']).toEqual([
      {
        PutRequest: {
          Item: { pk: { S: 'person' }, sk: { S: '25' } },
        },
      },
    ]);
  });

  it('keeps the native operation on client failures', async () => {
    const client = new Proxy({} as DynamoDBClient, {
      get: () => () => Effect.fail(new Error('denied')),
    });
    const layer = makeNativeService('people', client, 'people-table');

    const error = await Effect.runPromise(
      batchInsert('people', [{ pk: 'person', sk: '1' }]).pipe(
        Effect.provide(layer),
        Effect.flip,
      ),
    );

    expect(error).toMatchObject({ operation: 'batchInsert' });
    expect(error.cause).toEqual(new Error('denied'));
  });
});
