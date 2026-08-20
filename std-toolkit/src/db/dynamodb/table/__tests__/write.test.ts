import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { EncodedItem } from '../../../std-table/contract/index.js';
import type { PutItemInput } from '../../client/generated/types.js';
import type { DynamoDBClient } from '../../client/index.js';
import { makeTableContract } from '../table.js';

const table = {
  primary: { pk: 'PK', sk: 'SK' },
  localSecondaryIndexes: {},
  globalSecondaryIndexes: {},
};

const item: EncodedItem = {
  pk: 'person',
  sk: 'one',
  meta: {
    _e: 'Person',
    _u: '00000000000000000000000001',
    _d: false,
  },
  data: { _v: 'v1', name: 'Person' },
  keys: {},
};

describe('DynamoDB runtime write', () => {
  it('compiles write conditions through the expression builder', async () => {
    const inputs: PutItemInput[] = [];
    const client = new Proxy({} as DynamoDBClient, {
      get: (_target, property) =>
        property === 'putItem'
          ? (input: PutItemInput) => {
              inputs.push(input);
              return Effect.succeed({});
            }
          : undefined,
    });
    const runtime = makeTableContract(client, table, 'people');

    await Effect.runPromise(
      runtime.writeItem({
        item,
        condition: { kind: 'not-exists' },
      }),
    );
    await Effect.runPromise(
      runtime.writeItem({
        item,
        condition: { kind: 'updated', value: item.meta._u },
      }),
    );

    expect(inputs[0]).toMatchObject({
      ConditionExpression: 'attribute_not_exists(#cf_attr_1)',
      ExpressionAttributeNames: { '#cf_attr_1': 'PK' },
    });
    expect(inputs[1]).toMatchObject({
      ConditionExpression: '#cf_attr_1 = :cf_value_2',
      ExpressionAttributeNames: { '#cf_attr_1': '_u' },
      ExpressionAttributeValues: { ':cf_value_2': { S: item.meta._u } },
    });
  });
});
