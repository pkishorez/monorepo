import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { marshall } from '../../attribute-value/index.js';
import type {
  DeleteItemInput,
  ScanInput,
  ScanOutput,
} from '../../client/generated/types.js';
import type { DynamoDBClient } from '../../client/index.js';
import { makeTableContract } from '../table.js';

const table = {
  primary: { pk: 'pk', sk: 'sk' },
  localSecondaryIndexes: {},
  globalSecondaryIndexes: {},
};

const item = (
  pk: string,
): Record<string, ReturnType<typeof marshall>[string]> =>
  marshall({
    pk,
    sk: 'main',
    _e: 'person',
    _v: '1',
    _u: '1',
    _d: false,
    data: { name: pk },
  });

const clientWith = (
  scan: (input: ScanInput) => Effect.Effect<ScanOutput, Error>,
  remove: (input: DeleteItemInput) => Effect.Effect<object, Error>,
) =>
  new Proxy({} as DynamoDBClient, {
    get: (_target, property) => {
      if (property === 'scan') return scan;
      if (property === 'deleteItem') return remove;
      return undefined;
    },
  });

describe('DynamoDB runtime deletion', () => {
  it('removes the complete physical table without an entity filter', async () => {
    const scans: ScanInput[] = [];
    const client = clientWith(
      (input) => {
        scans.push(input);
        return Effect.succeed({ Items: [item('1'), item('2')] });
      },
      () => Effect.succeed({}),
    );

    expect(
      await Effect.runPromise(
        makeTableContract(client, table, 'people').hardDeleteAllItems(),
      ),
    ).toBe(2);
    expect(scans[0]).toEqual({ TableName: 'people' });
  });

  it('scans every page and accumulates the deleted count', async () => {
    const scans: ScanInput[] = [];
    const deletes: DeleteItemInput[] = [];
    const pageKey = marshall({ pk: '2', sk: 'main' });
    const client = clientWith(
      (input) => {
        scans.push(input);
        return Effect.succeed(
          input.ExclusiveStartKey === undefined
            ? { Items: [item('1'), item('2')], LastEvaluatedKey: pageKey }
            : { Items: [item('3')] },
        );
      },
      (input) => {
        deletes.push(input);
        return Effect.succeed({});
      },
    );

    const count = await Effect.runPromise(
      makeTableContract(client, table, 'people').hardDeleteEntityItems(
        'person',
      ),
    );

    expect(count).toBe(3);
    expect(scans).toHaveLength(2);
    expect(scans[0]).toMatchObject({
      FilterExpression: '#cf_attr_1 = :cf_value_2',
      ExpressionAttributeNames: { '#cf_attr_1': '_e' },
      ExpressionAttributeValues: { ':cf_value_2': { S: 'person' } },
    });
    expect(scans[1]?.ExclusiveStartKey).toEqual(pageKey);
    expect(deletes.map((input) => input.Key)).toEqual([
      marshall({ pk: '1', sk: 'main' }),
      marshall({ pk: '2', sk: 'main' }),
      marshall({ pk: '3', sk: 'main' }),
    ]);
  });

  it('maps failures from later scan pages', async () => {
    const client = clientWith(
      (input) =>
        input.ExclusiveStartKey === undefined
          ? Effect.succeed({
              Items: [],
              LastEvaluatedKey: marshall({ pk: '1', sk: 'main' }),
            })
          : Effect.fail(new Error('scan failed')),
      () => Effect.succeed({}),
    );

    const error = await Effect.runPromise(
      makeTableContract(client, table, 'people')
        .hardDeleteEntityItems('person')
        .pipe(Effect.flip),
    );

    expect(error).toMatchObject({ _tag: 'OperationFailure' });
    expect(error.cause).toEqual(new Error('scan failed'));
  });

  it('maps failures from deletes', async () => {
    const client = clientWith(
      () => Effect.succeed({ Items: [item('1')] }),
      () => Effect.fail(new Error('delete failed')),
    );

    const error = await Effect.runPromise(
      makeTableContract(client, table, 'people')
        .hardDeleteEntityItems('person')
        .pipe(Effect.flip),
    );

    expect(error).toMatchObject({ _tag: 'OperationFailure' });
    expect(error.cause).toEqual(new Error('delete failed'));
  });
});
