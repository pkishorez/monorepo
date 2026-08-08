import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Effect, Match, Schema } from 'effect';
import { nextUlid } from '../../../../core/index.js';
import {
  exprCondition,
  exprUpdate,
  resolveCondition,
  type AnyOperation,
  type ConditionInput,
  type ConditionOperation,
  type UpdateExprResult,
  type UpdateOps,
} from '../../domain/expression/index.js';
import { buildExpr } from '../../domain/expression/index.js';
import { isConditionalCheckFailed } from '../../internal/index.js';
import type { EntityTable as DynamoTable } from '../../domain/entity-persistence/index.js';
import type { DynamoDB } from '../dynamodb/index.js';
import { DynamoDBError } from '../dynamodb-error/index.js';
import {
  broadcastSingleEntity,
  singleMetaSchema,
  type SingleEntityContext,
  type SingleEntityType,
  type SingleMeta,
} from './single-entity-context.js';

export type SingleExpressionUpdate<T> = (
  operations: UpdateOps<T>,
) => AnyOperation<T>[];

export type SingleReadModifyWrite<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>> | null);

const buildUpdateCondition = <TSchema extends AnyUnkeyedESchema>(
  context: SingleEntityContext<DynamoTable<any, any>, TSchema>,
  userCondition?: ConditionInput<ESchemaType<TSchema>>,
  expectedU?: string,
): ConditionOperation => {
  const operations: ConditionOperation[] = [
    exprCondition(($) =>
      $.cond('_v' as any, '=', context.eschema.latestVersion),
    ),
  ];
  if (expectedU !== undefined) {
    operations.push(exprCondition(($) => $.cond('_u' as any, '=', expectedU)));
  }
  if (userCondition) operations.push(resolveCondition(userCondition));
  return exprCondition(($) => $.and(...operations));
};

export const prepareSingleEntityUpdate = <
  TTable extends DynamoTable<any, any>,
  TSchema extends AnyUnkeyedESchema,
>(
  context: SingleEntityContext<TTable, TSchema>,
  updates:
    | Partial<Omit<ESchemaType<TSchema>, '_v'>>
    | SingleExpressionUpdate<ESchemaType<TSchema>>,
  updateId: string,
  condition?: ConditionInput<ESchemaType<TSchema>>,
  expectedU?: string,
): { pk: string; sk: string; exprResult: UpdateExprResult } => {
  const builtCondition = buildUpdateCondition(context, condition, expectedU);
  const update =
    typeof updates === 'function'
      ? exprUpdate<any>(($) => [
          ...exprUpdate<any>(updates),
          $.set('_u', updateId),
        ])
      : exprUpdate<any>(($) => [
          ...Object.entries(updates).map(([key, value]) => $.set(key, value)),
          $.set('_u', updateId),
        ]);

  return {
    pk: context.key,
    sk: context.key,
    exprResult: buildExpr({ update, condition: builtCondition }),
  };
};

const mapUpdateError = <TSchema extends AnyUnkeyedESchema>(
  error: DynamoDBError,
  condition?: ConditionInput<ESchemaType<TSchema>>,
): DynamoDBError => {
  if (error._tag !== 'UpdateItemFailed' || !isConditionalCheckFailed(error)) {
    return error;
  }
  return condition
    ? DynamoDBError.conditionCheckFailed(error.cause)
    : DynamoDBError.noItemToUpdate(error.cause);
};

export const makeSingleEntityWriter = <
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
  const put = (
    value: Omit<ESchemaType<TSchema>, '_v'>,
  ): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    DynamoDBError,
    DynamoDB
  > =>
    Effect.gen(function* () {
      const fullValue = {
        ...value,
        _v: context.eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;
      const encoded = yield* context.eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError(DynamoDBError.putItemFailed));
      const updateId = yield* nextUlid;
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

      yield* context.table.putItem(item);
      yield* broadcastSingleEntity<TSchema>([
        { value: fullValue, meta: { ...meta, _d: false } },
      ]);
      return { value: fullValue, meta };
    }).pipe(
      Effect.withSpan('dynamodb.single-entity.put', {
        attributes: { entity: context.eschema.name },
      }),
    );

  const update = (params: {
    update:
      | Partial<Omit<ESchemaType<TSchema>, '_v'>>
      | SingleExpressionUpdate<ESchemaType<TSchema>>;
    condition?: ConditionInput<ESchemaType<TSchema>>;
  }): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    DynamoDBError,
    DynamoDB
  > =>
    Effect.gen(function* () {
      const updateId = yield* nextUlid;
      const prepared = prepareSingleEntityUpdate(
        context,
        params.update,
        updateId,
        params.condition,
      );
      const result = yield* context.table
        .updateItem(
          { pk: prepared.pk, sk: prepared.sk },
          { ReturnValues: 'ALL_NEW', ...prepared.exprResult },
        )
        .pipe(
          Effect.mapError((error) => mapUpdateError(error, params.condition)),
        );
      if (!result.Attributes) {
        return yield* Effect.fail(DynamoDBError.noItemToUpdate());
      }
      const value = yield* context.eschema
        .decode(result.Attributes)
        .pipe(Effect.mapError(DynamoDBError.updateItemFailed));
      const meta = Schema.decodeUnknownSync(singleMetaSchema)(
        result.Attributes,
      );
      yield* broadcastSingleEntity<TSchema>([
        {
          value: value as ESchemaType<TSchema>,
          meta: { ...meta, _d: false },
        },
      ]);
      return { value: value as ESchemaType<TSchema>, meta };
    }).pipe(
      Effect.withSpan('dynamodb.single-entity.update', {
        attributes: { entity: context.eschema.name },
      }),
    );

  const getAndUpdate = (
    input: SingleReadModifyWrite<ESchemaType<TSchema>>,
    config?: { retries?: number; lastWriteWins?: boolean },
  ): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    DynamoDBError,
    DynamoDB
  > => {
    const retries = config?.retries ?? 3;
    const attempt = (
      attemptNumber: number,
    ): Effect.Effect<
      SingleEntityType<ESchemaType<TSchema>>,
      DynamoDBError,
      DynamoDB
    > =>
      Effect.gen(function* () {
        const existing = yield* get({ ConsistentRead: true });
        const partial =
          typeof input === 'function' ? input(existing.value) : input;
        if (partial === null) return existing;

        const fullValue = {
          ...existing.value,
          ...partial,
          _v: context.eschema.latestVersion,
        } as ESchemaType<TSchema>;
        const encoded = yield* context.eschema
          .encode(fullValue as any)
          .pipe(Effect.mapError(DynamoDBError.putItemFailed));
        const updateId = yield* nextUlid;
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
        const condition = config?.lastWriteWins
          ? undefined
          : buildExpr({
              condition:
                existing.meta._u === ''
                  ? exprCondition(($) =>
                      $.attributeNotExists(context.table.primary.pk as any),
                    )
                  : exprCondition(($) =>
                      $.cond('_u' as any, '=', existing.meta._u),
                    ),
            });
        const conflict = yield* context.table.putItem(item, condition).pipe(
          Effect.as(null),
          Effect.catchIf(
            (error): error is DynamoDBError =>
              error._tag === 'PutItemFailed' && isConditionalCheckFailed(error),
            Effect.succeed,
          ),
        );

        return yield* Match.value(
          conflict === null
            ? 'written'
            : attemptNumber < retries
              ? 'retry'
              : 'exhausted',
        ).pipe(
          Match.when('written', () =>
            broadcastSingleEntity<TSchema>([
              { value: fullValue, meta: { ...meta, _d: false } },
            ]).pipe(Effect.as({ value: fullValue, meta })),
          ),
          Match.when('retry', () => attempt(attemptNumber + 1)),
          Match.when('exhausted', () =>
            Effect.fail(DynamoDBError.conditionCheckFailed(conflict?.cause)),
          ),
          Match.exhaustive,
        );
      });

    return attempt(0).pipe(
      Effect.withSpan('dynamodb.single-entity.get-and-update', {
        attributes: { entity: context.eschema.name },
      }),
    );
  };

  const reset = () =>
    put(context.defaultValue).pipe(
      Effect.withSpan('dynamodb.single-entity.reset', {
        attributes: { entity: context.eschema.name },
      }),
    );

  return { put, update, getAndUpdate, reset } as const;
};
