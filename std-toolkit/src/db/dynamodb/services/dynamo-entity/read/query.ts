import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect, Option, Schema, Stream } from 'effect';
import { deriveIndexKeyValue } from '../../../internal/index.js';
import type {
  CustomSkParam,
  IndexPkValue,
  QueryStreamOptions,
  SimpleQueryOptions,
  SkParam,
  StreamSkParam,
} from '../../../types/index.js';
import { extractKeyOp, getKeyOpScanDirection } from '../../../types/index.js';
import type { SortKeyparameter } from '../../../domain/expression/index.js';
import type { EntityTable as DynamoTable } from '../../../domain/entity-persistence/index.js';
import type { DynamoDB } from '../../dynamodb/index.js';
import { DynamoDBError } from '../../dynamodb-error/index.js';
import type { EntityType } from '../dynamo-entity.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';

type ResolveSkParam<
  TEntity,
  TDerivation extends StoredIndexDerivation,
> = TDerivation['isTimelineSk'] extends true
  ? SkParam
  : CustomSkParam<TEntity, TDerivation['skDeps'] & readonly (keyof TEntity)[]>;

type CustomStreamSkParam<T, TKeys extends readonly (keyof T)[]> =
  | { '>': Pick<T, TKeys[number]> | null }
  | { '<': Pick<T, TKeys[number]> | null };

type ResolveStreamSkParam<
  TEntity,
  TDerivation extends StoredIndexDerivation,
> = TDerivation['isTimelineSk'] extends true
  ? StreamSkParam
  : CustomStreamSkParam<
      TEntity,
      TDerivation['skDeps'] & readonly (keyof TEntity)[]
    >;

const entityMetaSchema = Schema.Struct({
  _e: Schema.String,
  _v: Schema.String,
  _u: Schema.String,
  _d: Schema.Boolean,
});

export const makeEntityQuery = <
  TTable extends DynamoTable<any, any>,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
>(
  table: TTable,
  eschema: TSchema,
  index: EntityIndex<TSecondaryDerivationMap>,
) => {
  const decodeItems = (items: unknown[]) =>
    Effect.all(
      items.map((item) =>
        eschema.decode(item).pipe(
          Effect.map((value) => ({
            value: value as ESchemaType<TSchema>,
            meta: Schema.decodeUnknownSync(entityMetaSchema)(item),
          })),
          Effect.mapError(DynamoDBError.queryFailed),
        ),
      ),
    );

  const query = <
    K extends 'primary' | (keyof TSecondaryDerivationMap & string),
  >(
    key: K,
    params: K extends 'primary'
      ? [TPrimaryPkKeys] extends [never]
        ? { pk?: {}; sk: SkParam }
        : {
            pk: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys>;
            sk: SkParam;
          }
      : K extends keyof TSecondaryDerivationMap
        ? {
            pk: Pick<
              ESchemaType<TSchema>,
              TSecondaryDerivationMap[K]['pkDeps'][number] &
                keyof ESchemaType<TSchema>
            >;
            sk: ResolveSkParam<
              ESchemaType<TSchema>,
              TSecondaryDerivationMap[K]
            >;
          }
        : never,
    options?: SimpleQueryOptions,
  ): Effect.Effect<
    { items: EntityType<ESchemaType<TSchema>>[] },
    DynamoDBError,
    DynamoDB
  > =>
    Effect.gen(function* () {
      const { operator, value } = extractKeyOp(params.sk as SkParam);
      const scanForward = getKeyOpScanDirection(operator);
      const queryOptions: { Limit?: number; ScanIndexForward?: boolean } = {
        ScanIndexForward: scanForward,
      };
      if (options?.limit !== undefined) queryOptions.Limit = options.limit;

      if (key === 'primary') {
        const pk = deriveIndexKeyValue(
          eschema.name,
          index.primary.pkDeps,
          (params.pk ?? {}) as Record<string, unknown>,
          true,
        );
        const sk: SortKeyparameter | undefined =
          value === null
            ? undefined
            : operator === 'beginsWith'
              ? { beginsWith: value as string }
              : ({ [operator]: value } as SortKeyparameter);
        const { Items } = yield* table.query({ pk, sk }, queryOptions);
        return { items: yield* decodeItems(Items) };
      }

      const derivation = index.secondary[key];
      if (!derivation) {
        return yield* Effect.fail(
          DynamoDBError.queryFailed(`Index ${String(key)} not found`),
        );
      }
      const pk = deriveIndexKeyValue(
        `${eschema.name}#${derivation.entityIndexName}`,
        derivation.pkDeps,
        params.pk as Record<string, unknown>,
        true,
      );
      const resolvedValue = index.sortKey(value, derivation);
      const sk: SortKeyparameter | undefined =
        resolvedValue === null
          ? undefined
          : operator === 'beginsWith'
            ? { beginsWith: resolvedValue }
            : ({ [operator]: resolvedValue } as SortKeyparameter);
      const { Items } = yield* table.queryIndex(
        derivation.gsiName as any,
        { pk, sk },
        queryOptions,
      );
      return { items: yield* decodeItems(Items) };
    }).pipe(
      Effect.withSpan('dynamodb.entity.query', {
        attributes: { entity: eschema.name, index: String(key) },
      }),
    );

  const queryStream = <
    K extends 'primary' | (keyof TSecondaryDerivationMap & string),
  >(
    key: K,
    params: K extends 'primary'
      ? [TPrimaryPkKeys] extends [never]
        ? { pk?: {}; sk: StreamSkParam }
        : {
            pk: IndexPkValue<ESchemaType<TSchema>, TPrimaryPkKeys>;
            sk: StreamSkParam;
          }
      : K extends keyof TSecondaryDerivationMap
        ? {
            pk: Pick<
              ESchemaType<TSchema>,
              TSecondaryDerivationMap[K]['pkDeps'][number] &
                keyof ESchemaType<TSchema>
            >;
            sk: ResolveStreamSkParam<
              ESchemaType<TSchema>,
              TSecondaryDerivationMap[K]
            >;
          }
        : never,
    options?: QueryStreamOptions,
  ): Stream.Stream<
    EntityType<ESchemaType<TSchema>>[],
    DynamoDBError,
    DynamoDB
  > => {
    const batchSize = options?.batchSize ?? 100;
    const operator = '>' in params.sk ? '>' : '<';
    const initialValue = '>' in params.sk ? params.sk['>'] : params.sk['<'];
    const derivation = key === 'primary' ? undefined : index.secondary[key];
    const customSortKey = derivation && !derivation.isTimelineSk;
    const initialCursor = customSortKey
      ? index.sortKey(initialValue, derivation)
      : (initialValue as string | null);

    const readPage = (cursor: string | null) =>
      Effect.gen(function* () {
        const result = yield* query(
          key,
          { pk: params.pk, sk: { [operator]: cursor } } as any,
          { limit: batchSize },
        );
        const chunk = [result.items];
        if (result.items.length === 0 || result.items.length < batchSize) {
          return [chunk, Option.none<string | null>()] as const;
        }
        const last = result.items[result.items.length - 1]!;
        const nextCursor =
          key === 'primary'
            ? ((last.value as Record<string, unknown>)[
                eschema.idField
              ] as string)
            : customSortKey
              ? index.sortKey(last.value, derivation)
              : last.meta._u;
        return [chunk, Option.some(nextCursor)] as const;
      });

    return Stream.paginate(initialCursor, readPage).pipe(
      Stream.withSpan('dynamodb.entity.query-stream', {
        attributes: { entity: eschema.name, index: String(key), batchSize },
      }),
    );
  };

  return { query, queryStream } as const;
};
