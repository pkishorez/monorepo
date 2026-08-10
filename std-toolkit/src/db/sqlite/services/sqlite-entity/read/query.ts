import type {
  AnyEntityESchema,
  ESchemaType,
  Prettify,
} from '../../../../../eschema/index.js';
import { Effect, Option, Schema, Stream } from 'effect';
import {
  EntityPersistence,
  type CustomSkParam,
  type CustomStreamSkParam,
  type QueryStreamOptions,
  type RawRow,
  type SimpleQueryOptions,
  type SkParam,
  type StreamSkParam,
} from '../../../domain/entity-persistence/index.js';
import type { SQLiteDatabase } from '../../sqlite-database/index.js';
import { SQLiteError } from '../../../domain/sqlite-error/index.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import type { SortKeyCondition, SQLiteEntityTable } from '../entity-table.js';
import type { EntityType } from '../sqlite-entity.js';

type IndexKeyFields<T, K extends keyof T> = Pick<T, K>;
type ResolveSkParam<
  T,
  D extends StoredIndexDerivation,
> = D['isTimelineSk'] extends true
  ? SkParam
  : CustomSkParam<T, D['skDeps'] & readonly (keyof T)[]>;
type ResolveStreamSkParam<
  T,
  D extends StoredIndexDerivation,
> = D['isTimelineSk'] extends true
  ? StreamSkParam
  : CustomStreamSkParam<T, D['skDeps'] & readonly (keyof T)[]>;

const { extractKeyOp, getKeyOpScanDirection, sqlMetaSchema } =
  EntityPersistence;

export const makeEntityQuery = <
  TTable extends SQLiteEntityTable,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
>(
  table: TTable,
  eschema: TSchema,
  index: EntityIndex<TTable, TSecondaryDerivationMap>,
) => {
  const decodeItems = (items: RawRow[]) =>
    Effect.all(
      items.map((item) =>
        eschema.decode({ ...JSON.parse(item._data), _v: item._v }).pipe(
          Effect.mapError((cause) =>
            SQLiteError.queryFailed(table.tableName, cause),
          ),
          Effect.map((value) => ({
            value: value as ESchemaType<TSchema>,
            meta: Schema.decodeSync(sqlMetaSchema)({
              _v: item._v,
              _u: item._u,
              _d: item._d,
              _e: item._e ?? eschema.name,
            }),
          })),
        ),
      ),
    );

  const query = <K extends 'primary' | keyof TSecondaryDerivationMap>(
    key: K,
    params: K extends 'primary'
      ? [TPrimaryPkKeys] extends [never]
        ? { pk?: {}; sk: SkParam }
        : {
            pk: Prettify<IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys>>;
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
    SQLiteError,
    SQLiteDatabase
  > =>
    Effect.gen(function* () {
      const { operator, value } = extractKeyOp(params.sk as SkParam);
      const queryOptions: { Limit?: number; ScanIndexForward?: boolean } = {
        ScanIndexForward: getKeyOpScanDirection(operator),
      };
      if (options?.limit !== undefined) queryOptions.Limit = options.limit;

      if (key === 'primary') {
        const pk = index.derivePrimary(
          (params.pk ?? {}) as Record<string, unknown>,
        ).pk;
        const sk =
          value === null
            ? undefined
            : ({ [operator]: value } as SortKeyCondition);
        const result = yield* table.query(
          sk ? { pk, sk } : { pk },
          queryOptions,
        );
        return { items: yield* decodeItems(result.Items) };
      }

      const derivation = index.secondary[key];
      if (!derivation) {
        return yield* Effect.fail(
          SQLiteError.queryFailed(
            table.tableName,
            `Index ${String(key)} not found`,
          ),
        );
      }

      const pk = EntityPersistence.deriveIndexKeyValue(
        `${eschema.name}#${derivation.entityIndexName}`,
        derivation.pkDeps,
        params.pk as Record<string, unknown>,
        true,
      );
      const resolved = index.resolveSortKey(value, derivation);
      const sk =
        resolved === null
          ? undefined
          : ({ [operator]: resolved } as SortKeyCondition);
      const result = yield* table
        .index(derivation.indexName)
        .query(sk ? { pk, sk } : { pk }, queryOptions);
      return { items: yield* decodeItems(result.Items) };
    }).pipe(
      Effect.withSpan('sqlite.entity.query', {
        attributes: { entity: eschema.name, index: String(key) },
      }),
    );

  const queryStream = <K extends 'primary' | keyof TSecondaryDerivationMap>(
    key: K,
    params: K extends 'primary'
      ? [TPrimaryPkKeys] extends [never]
        ? { pk?: {}; sk: StreamSkParam }
        : {
            pk: Prettify<IndexKeyFields<ESchemaType<TSchema>, TPrimaryPkKeys>>;
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
    SQLiteError,
    SQLiteDatabase
  > => {
    const batchSize = options?.batchSize ?? 100;
    const operator = '>' in params.sk ? '>' : '<';
    const initialValue = '>' in params.sk ? params.sk['>'] : params.sk['<'];
    const derivation = key === 'primary' ? undefined : index.secondary[key];
    const customSortKey = derivation && !derivation.isTimelineSk;
    const initialCursor = customSortKey
      ? index.resolveSortKey(initialValue, derivation)
      : (initialValue as string | null);

    return Stream.paginate(initialCursor, (cursor: string | null) =>
      Effect.gen(function* () {
        const result = yield* query(
          key,
          { pk: params.pk, sk: { [operator]: cursor } as SkParam } as any,
          { limit: batchSize },
        );
        const items = result.items;
        if (items.length === 0 || items.length < batchSize) {
          return [[items], Option.none<string | null>()] as const;
        }

        const last = items[items.length - 1]!;
        const next =
          key === 'primary'
            ? ((last.value as Record<string, unknown>)[
                eschema.idField
              ] as string)
            : customSortKey
              ? index.resolveSortKey(last.value, derivation)
              : last.meta._u;
        return [[items], Option.some(next)] as const;
      }),
    ).pipe(
      Stream.withSpan('sqlite.entity.query-stream', {
        attributes: { entity: eschema.name, index: String(key), batchSize },
      }),
    );
  };

  return { query, queryStream } as const;
};
