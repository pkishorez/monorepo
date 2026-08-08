import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Effect, Match, Schema } from 'effect';
import type { DynamoDB } from '../dynamodb/index.js';
import { DynamoDBError } from '../dynamodb-error/index.js';
import type { EntityTable as DynamoTable } from '../../domain/entity-persistence/index.js';
import {
  singleMetaSchema,
  type SingleEntityContext,
  type SingleEntityType,
} from './single-entity-context.js';

export const makeSingleEntityReader = <
  TTable extends DynamoTable<any, any>,
  TSchema extends AnyUnkeyedESchema,
>(
  context: SingleEntityContext<TTable, TSchema>,
) => {
  const get = (options?: {
    ConsistentRead?: boolean;
  }): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    DynamoDBError,
    DynamoDB
  > =>
    Effect.gen(function* () {
      const { Item } = yield* context.table.getItem(
        { pk: context.key, sk: context.key },
        options,
      );

      return yield* Match.value(Boolean(Item)).pipe(
        Match.when(true, () =>
          context.eschema.decode(Item!).pipe(
            Effect.mapError(DynamoDBError.getItemFailed),
            Effect.map((value) => ({
              value: value as ESchemaType<TSchema>,
              meta: Schema.decodeUnknownSync(singleMetaSchema)(Item),
            })),
          ),
        ),
        Match.when(false, () =>
          Effect.succeed({
            value: context.defaultValue,
            meta: {
              _e: context.eschema.name,
              _v: context.eschema.latestVersion,
              _u: '',
            },
          }),
        ),
        Match.exhaustive,
      );
    }).pipe(
      Effect.withSpan('dynamodb.single-entity.get', {
        attributes: { entity: context.eschema.name },
      }),
    );

  return { get } as const;
};
