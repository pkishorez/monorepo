import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Effect } from 'effect';
import { nextUlid } from '../../../../core/index.js';
import { SQL as Sql } from '../../domain/sql-statement/index.js';
import type { SQLiteEntityTable } from '../sqlite-entity/index.js';
import { SQLiteDatabase } from '../sqlite-database/index.js';
import { SQLiteError } from '../../domain/sqlite-error/index.js';
import {
  broadcastSQLiteSingleEntity,
  type SingleEntityType,
  type SingleMetaType,
  type SQLiteSingleEntityContext,
} from './single-entity-context.js';

export type SQLiteSingleReadModifyWrite<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>> | null);

export const makeSQLiteSingleEntityWriter = <
  TTable extends SQLiteEntityTable,
  TSchema extends AnyUnkeyedESchema,
>(
  context: SQLiteSingleEntityContext<TTable, TSchema>,
  get: () => Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    SQLiteError,
    SQLiteDatabase
  >,
) => {
  const prepareValue = (
    value: Omit<ESchemaType<TSchema>, '_v'>,
    operation: 'insert' | 'update',
  ) => {
    const fullValue = {
      ...value,
      _v: context.eschema.latestVersion,
    } as unknown as ESchemaType<TSchema>;
    return context.eschema.encode(fullValue as any).pipe(
      Effect.mapError((error) =>
        operation === 'insert'
          ? SQLiteError.insertFailed(context.table.tableName, error)
          : SQLiteError.updateFailed(context.table.tableName, error),
      ),
      Effect.map((encoded) => ({ fullValue, encoded })),
    );
  };

  const put = (
    value: Omit<ESchemaType<TSchema>, '_v'>,
  ): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    SQLiteError,
    SQLiteDatabase
  > =>
    Effect.gen(function* () {
      const { fullValue, encoded } = yield* prepareValue(value, 'insert');
      const _u = yield* nextUlid;
      const meta: SingleMetaType = {
        _e: context.eschema.name,
        _v: context.eschema.latestVersion,
        _u,
      };
      const existing = yield* context.table.getItem(context.key);
      if (existing.Item) {
        yield* context.table.updateItem(context.key, {
          _data: JSON.stringify(encoded),
          _v: context.eschema.latestVersion,
          _u,
        });
      } else {
        yield* context.table.putItem({
          ...context.key,
          _data: JSON.stringify(encoded),
          _e: context.eschema.name,
          _v: context.eschema.latestVersion,
          _u,
          _d: 0,
        });
      }
      yield* broadcastSQLiteSingleEntity<TSchema>([
        { value: fullValue, meta: { ...meta, _d: false } },
      ]);
      return { value: fullValue, meta };
    }).pipe(
      Effect.withSpan('sqlite.single-entity.put', {
        attributes: { entity: context.eschema.name },
      }),
    );

  const getAndUpdate = (
    update: SQLiteSingleReadModifyWrite<ESchemaType<TSchema>>,
    config?: { retries?: number; lastWriteWins?: boolean },
  ): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    SQLiteError,
    SQLiteDatabase
  > =>
    Effect.gen(function* () {
      const db = yield* SQLiteDatabase;
      const retries = config?.retries ?? 3;
      for (let attempt = 0; ; attempt++) {
        const existing = yield* get();
        const partial =
          typeof update === 'function' ? update(existing.value) : update;
        if (partial === null) return existing;
        const fullValue = {
          ...existing.value,
          ...partial,
        } as ESchemaType<TSchema>;
        const encoded = yield* context.eschema
          .encode(fullValue as any)
          .pipe(
            Effect.mapError((error) =>
              SQLiteError.updateFailed(context.table.tableName, error),
            ),
          );
        const _u = yield* nextUlid;
        const meta: SingleMetaType = {
          _e: context.eschema.name,
          _v: context.eschema.latestVersion,
          _u,
        };

        if (existing.meta._u === '') {
          const inserted = yield* context.table
            .putItem({
              ...context.key,
              _data: JSON.stringify(encoded),
              _e: context.eschema.name,
              _v: context.eschema.latestVersion,
              _u,
              _d: 0,
            })
            .pipe(
              Effect.as(true),
              Effect.catch((error) =>
                context.table.getItem(context.key).pipe(
                  Effect.map(({ Item }) => Item !== null),
                  Effect.catch(() => Effect.succeed(false)),
                  Effect.flatMap((concurrentlyInserted) =>
                    concurrentlyInserted
                      ? Effect.succeed(false)
                      : Effect.fail(error),
                  ),
                ),
              ),
            );
          if (!inserted) {
            if (attempt < retries) continue;
            return yield* Effect.fail(
              SQLiteError.conditionFailed(context.table.tableName, context.key),
            );
          }
        } else {
          const values = {
            _data: JSON.stringify(encoded),
            _v: context.eschema.latestVersion,
            _u,
          };
          if (config?.lastWriteWins) {
            yield* context.table.updateItem(context.key, values);
          } else {
            const where = Sql.whereAnd(
              Sql.wherePkSkExact(
                context.table.primary.pk,
                context.table.primary.sk,
                context.key.pk,
                context.key.sk,
              ),
              Sql.where('_u', '=', existing.meta._u),
            );
            const { rowsWritten } = yield* db.update(
              context.table.tableName,
              values,
              where,
            );
            if (rowsWritten === 0) {
              if (attempt < retries) continue;
              return yield* Effect.fail(
                SQLiteError.conditionFailed(
                  context.table.tableName,
                  context.key,
                ),
              );
            }
          }
        }

        yield* broadcastSQLiteSingleEntity<TSchema>([
          { value: fullValue, meta: { ...meta, _d: false } },
        ]);
        return { value: fullValue, meta };
      }
    }).pipe(
      Effect.withSpan('sqlite.single-entity.get-and-update', {
        attributes: { entity: context.eschema.name },
      }),
    );

  const reset = () =>
    put(context.defaultValue).pipe(
      Effect.withSpan('sqlite.single-entity.reset', {
        attributes: { entity: context.eschema.name },
      }),
    );

  return { put, getAndUpdate, reset } as const;
};
