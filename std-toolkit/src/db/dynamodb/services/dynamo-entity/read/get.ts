import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect, Match, Schema } from 'effect';
import type { IndexPkValue } from '../../../types/index.js';
import type { EntityTable as DynamoTable } from '../../../domain/entity-persistence/index.js';
import type { DynamoDB } from '../../dynamodb/index.js';
import { DynamoDBError } from '../../../domain/dynamodb-error/index.js';
import type { EntityType } from '../dynamo-entity.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';

const entityMetaSchema = Schema.Struct({
  _e: Schema.String,
  _v: Schema.String,
  _u: Schema.String,
  _d: Schema.Boolean,
});

export const makeEntityGet =
  <
    TTable extends DynamoTable<any, any>,
    TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
    TSchema extends AnyEntityESchema,
    TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
  >(
    table: TTable,
    eschema: TSchema,
    index: EntityIndex<TSecondaryDerivationMap>,
  ) =>
  (
    keyValue: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys> &
      Pick<ESchemaType<TSchema>, TSchema['idField']>,
    options?: { ConsistentRead?: boolean },
  ): Effect.Effect<
    EntityType<ESchemaType<TSchema>> | null,
    DynamoDBError,
    DynamoDB
  > =>
    Effect.gen(function* () {
      const key = index.primaryKey(keyValue as Record<string, unknown>);
      const { Item } = yield* table.getItem(key, options);
      return yield* Match.value(Boolean(Item)).pipe(
        Match.when(true, () =>
          eschema.decode(Item!).pipe(
            Effect.mapError(DynamoDBError.getItemFailed),
            Effect.map((value) => ({
              value: value as ESchemaType<TSchema>,
              meta: Schema.decodeUnknownSync(entityMetaSchema)(Item),
            })),
          ),
        ),
        Match.when(false, () => Effect.succeed(null)),
        Match.exhaustive,
      );
    }).pipe(
      Effect.withSpan('dynamodb.entity.get', {
        attributes: { entity: eschema.name },
      }),
    );
