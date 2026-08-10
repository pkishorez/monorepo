import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Effect } from 'effect';
import {
  exprCondition,
  type ConditionInput,
} from '../../domain/expression/index.js';
import { buildExpr } from '../../domain/expression/index.js';
import type { TransactItem } from '../../types/index.js';
import type { EntityTable as DynamoTable } from '../../domain/entity-persistence/index.js';
import type { DynamoDB } from '../dynamodb/index.js';
import { DynamoDBError } from '../../domain/dynamodb-error/index.js';
import type {
  SingleEntityContext,
  SingleEntityType,
  SingleMeta,
} from './single-entity-context.js';
import {
  prepareSingleEntityUpdate,
  type SingleExpressionUpdate,
} from './single-entity-writer.js';

export const makeSingleEntityTransaction = <
  TTable extends DynamoTable<any, any>,
  TSchema extends AnyUnkeyedESchema,
>(
  context: SingleEntityContext<TTable, TSchema>,
  get: (options?: {
    ConsistentRead?: boolean;
  }) => Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    DynamoDBError,
    DynamoDB
  >,
) => {
  const updateOp = (params: {
    update:
      | Partial<Omit<ESchemaType<TSchema>, '_v'>>
      | SingleExpressionUpdate<ESchemaType<TSchema>>;
    condition?: ConditionInput<ESchemaType<TSchema>>;
    lastWriteWins?: boolean;
  }): Effect.Effect<TransactItem, DynamoDBError, DynamoDB> =>
    Effect.gen(function* () {
      const existing = yield* get({ ConsistentRead: true });
      if (existing.meta._u === '') {
        return yield* Effect.fail(DynamoDBError.noItemToUpdate());
      }

      const expectedU = params.lastWriteWins ? undefined : existing.meta._u;
      const mergedValue =
        typeof params.update === 'function'
          ? existing.value
          : ({ ...existing.value, ...params.update } as ESchemaType<TSchema>);

      return {
        entityName: context.eschema.name,
        operationKind: 'updateOp',
        pk: context.key,
        sk: context.key,
        table: context.table,
        apply: (updateId) => {
          const prepared = prepareSingleEntityUpdate(
            context,
            params.update,
            updateId,
            params.condition,
            expectedU,
          );
          return {
            ...context.table.opUpdateItem(
              { pk: prepared.pk, sk: prepared.sk },
              prepared.exprResult,
            ),
            broadcast: {
              value: mergedValue,
              meta: { ...existing.meta, _u: updateId, _d: false },
            },
          };
        },
      } satisfies TransactItem;
    });

  const getAndUpdateOp = (
    update:
      | Partial<Omit<ESchemaType<TSchema>, '_v'>>
      | ((
          current: ESchemaType<TSchema>,
        ) => Partial<Omit<ESchemaType<TSchema>, '_v'>>),
    config?: { lastWriteWins?: boolean },
  ): Effect.Effect<TransactItem, DynamoDBError, DynamoDB> =>
    Effect.gen(function* () {
      const existing = yield* get({ ConsistentRead: true });
      if (existing.meta._u === '') {
        return yield* Effect.fail(DynamoDBError.noItemToUpdate());
      }

      const fullValue = {
        ...existing.value,
        ...(typeof update === 'function' ? update(existing.value) : update),
        _v: context.eschema.latestVersion,
      } as ESchemaType<TSchema>;
      const encoded = yield* context.eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError(DynamoDBError.putItemFailed));
      const condition = config?.lastWriteWins
        ? undefined
        : buildExpr({
            condition: exprCondition(($) =>
              $.cond('_u' as any, '=', existing.meta._u),
            ),
          });

      return {
        entityName: context.eschema.name,
        operationKind: 'updateOp',
        pk: context.key,
        sk: context.key,
        table: context.table,
        apply: (updateId) => {
          const meta: SingleMeta = {
            _e: context.eschema.name,
            _v: context.eschema.latestVersion,
            _u: updateId,
          };
          const item = {
            ...encoded,
            ...meta,
            [context.table.primary.pk]: context.key,
            [context.table.primary.sk]: context.key,
          };
          return {
            ...context.table.opPutItem(item, condition),
            broadcast: {
              value: fullValue,
              meta: { ...meta, _d: false },
            },
          };
        },
      } satisfies TransactItem;
    });

  return { updateOp, getAndUpdateOp } as const;
};
