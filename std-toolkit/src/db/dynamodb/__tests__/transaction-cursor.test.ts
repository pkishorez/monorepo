import { Effect, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { nextUlid } from '../../../core/index.js';
import { EntityESchema } from '../../../eschema/index.js';
import { unmarshall } from '../internal/marshall.js';
import { DynamoDB } from '../services/dynamo-client.js';
import { DynamoTable } from '../services/dynamo-table.js';

const ItemSchema = EntityESchema.make('Item', 'itemId', {
  category: Schema.String,
}).build();

describe('DynamoDB', () => {
  describe('Transactions', () => {
    describe('Cursors', () => {
      it('stamps transaction cursors immediately before submitting the write', async () => {
        const table = DynamoTable.make()
          .primary('pk', 'sk')
          .gsi('GSI1', 'GSI1PK', 'GSI1SK')
          .build();
        const entity = table
          .entity(ItemSchema)
          .primary()
          .index('GSI1', 'byCategory', { pk: ['category'] })
          .build();
        let request: any;
        const layer = Layer.succeed(DynamoDB, {
          tableName: 'items',
          client: {
            transactWriteItems: (input: unknown) =>
              Effect.sync(() => {
                request = input;
              }),
          } as any,
        });

        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const delayedOp = yield* entity.insertOp({
              itemId: 'delayed',
              category: 'category-1',
            });
            const interveningU = yield* nextUlid;
            const [written] = yield* table.transact([delayedOp]);
            return { written, interveningU };
          }).pipe(Effect.provide(layer)),
        );

        expect(result.written!.meta._u > result.interveningU).toBe(true);
        const submitted = unmarshall(request.TransactItems[0].Put.Item);
        expect(submitted._u).toBe(result.written!.meta._u);
        expect(submitted.GSI1SK).toBe(result.written!.meta._u);
      });

      it('maps canceled conditional writes to ConditionFailed with op context', async () => {
        const table = DynamoTable.make().primary('pk', 'sk').build();
        const cancellation = Object.assign(new Error('transaction canceled'), {
          cancellationReasons: [
            {
              Code: 'ConditionalCheckFailed',
              Message: 'The conditional request failed',
            },
          ],
        });
        const layer = Layer.succeed(DynamoDB, {
          tableName: 'items',
          client: {
            transactWriteItems: () => Effect.fail(cancellation),
          } as any,
        });
        const op = {
          entityName: 'Item',
          operationKind: 'updateOp' as const,
          pk: 'Item',
          sk: 'Item#stale',
          table,
          apply: (u: string) => ({
            kind: 'update' as const,
            options: {
              Key: {},
              UpdateExpression: 'SET #u = :u',
            },
            broadcast: {
              value: { itemId: 'stale', category: 'category-1', _v: 'v1' },
              meta: { _e: 'Item', _v: 'v1', _u: u, _d: false },
            },
          }),
        };

        const error = await Effect.runPromise(
          table.transact([op]).pipe(Effect.provide(layer), Effect.flip),
        );

        expect(error.error._tag).toBe('ConditionFailed');
        if (error.error._tag === 'ConditionFailed') {
          expect(error.error.failures).toEqual([
            {
              index: 0,
              entityName: 'Item',
              operationKind: 'updateOp',
              writeKind: 'update',
              reasonCode: 'ConditionalCheckFailed',
              message: 'The conditional request failed',
            },
          ]);
        }
      });
    });
  });
});
