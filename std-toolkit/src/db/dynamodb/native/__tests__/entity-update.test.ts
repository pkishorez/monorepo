import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Ulid } from '../../../../core/index.js';
import { EntityESchema } from '../../../../eschema/index.js';
import { StdTable } from '../../../std-table/table/index.js';
import type { EncodedItem } from '../../../std-table/contract/index.js';
import type { DynamoDBClient } from '../../client/index.js';
import type {
  PutItemInput,
  UpdateItemInput,
} from '../../client/generated/types.js';
import { itemSchema, type DecodedItem } from '../../item-schema/index.js';
import type { TableDefinition } from '../../../std-table/definition/index.js';

type TableIndexes = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;
const encodeItem = (table: TableIndexes, item: EncodedItem): DecodedItem =>
  Schema.decodeSync(itemSchema(table))(item);
const decodeItem = (table: TableIndexes, decoded: DecodedItem): EncodedItem =>
  Schema.encodeSync(itemSchema(table))(decoded);
import { makeNativeService } from '../native.js';
import { update } from '../entity-update.js';

const oldSchema = EntityESchema.make('Counter', 'counterId', {
  count: Schema.Number,
}).build();
const currentSchema = EntityESchema.make('Counter', 'counterId', {
  count: Schema.Number,
})
  .evolve('v2', { label: Schema.String }, (value) => ({
    ...value,
    label: 'migrated',
  }))
  .build();
const oldTable = StdTable.make('migration').primary('pk', 'sk').build();
const currentTable = StdTable.make('migration').primary('pk', 'sk').build();
oldTable.entity(oldSchema).primary().build();
const counter = currentTable.entity(currentSchema).primary().build();

const oldItem: EncodedItem = {
  pk: 'Counter',
  sk: 'one',
  meta: {
    _e: 'Counter',
    _v: 'v1',
    _u: '00000000000000000000000001',
    _d: false,
  },
  data: { _v: 'v1', counterId: 'one', count: 1 },
  keys: {},
};

describe('DynamoDB entity update', () => {
  it('migrates stale storage before applying an expression update', async () => {
    const puts: PutItemInput[] = [];
    const updates: UpdateItemInput[] = [];
    let current = oldItem;
    const client = new Proxy({} as DynamoDBClient, {
      get: (_target, property) => {
        if (property === 'getItem') {
          return () =>
            Effect.succeed({ Item: encodeItem(currentTable, current) });
        }
        if (property === 'putItem') {
          return (input: PutItemInput) => {
            puts.push(input);
            current = decodeItem(currentTable, input.Item as DecodedItem);
            return Effect.succeed({});
          };
        }
        if (property === 'updateItem') {
          return (input: UpdateItemInput) => {
            updates.push(input);
            current = {
              ...current,
              data: { ...current.data, count: 2 },
              meta: { ...current.meta, _u: '00000000000000000000000002' },
            };
            return Effect.succeed({
              Attributes: encodeItem(currentTable, current),
            });
          };
        }
        return undefined;
      },
    });

    const result = await Effect.runPromise(
      update(counter, {
        key: { counterId: 'one' },
        update: ($) => [$.set('count', $.opAdd('count', 1))],
      }).pipe(
        Effect.provide(makeNativeService('migration', client, 'counters')),
        Effect.provideService(Ulid, () => '00000000000000000000000002'),
      ),
    );

    expect(puts).toHaveLength(1);
    expect(
      decodeItem(currentTable, puts[0]!.Item as DecodedItem),
    ).toMatchObject({
      meta: { _v: 'v2' },
      data: { _v: 'v2', label: 'migrated' },
    });
    expect(puts[0]).toMatchObject({
      ConditionExpression: '#cf_attr_1 = :cf_value_2',
      ExpressionAttributeNames: { '#cf_attr_1': '_u' },
      ExpressionAttributeValues: {
        ':cf_value_2': { S: '00000000000000000000000001' },
      },
    });
    expect(updates).toHaveLength(1);
    expect(result.value).toEqual({
      counterId: 'one',
      count: 2,
      label: 'migrated',
    });
    expect(result.meta._u).toBe('00000000000000000000000002');
  });
});
