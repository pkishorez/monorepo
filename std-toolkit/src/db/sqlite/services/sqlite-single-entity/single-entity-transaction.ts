import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Effect } from 'effect';
import type {
  SQLiteEntityTable,
  SqliteEntityOp,
  SqliteWriteOp,
} from '../sqlite-entity/index.js';
import { SQLiteDatabase } from '../sqlite-database/index.js';
import { SQLiteError } from '../../domain/sqlite-error/index.js';
import type {
  SingleEntityType,
  SQLiteSingleEntityContext,
} from './single-entity-context.js';

export const makeSQLiteSingleEntityTransaction = <
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
  const getAndUpdateOp = (
    update:
      | Partial<Omit<ESchemaType<TSchema>, '_v'>>
      | ((
          current: ESchemaType<TSchema>,
        ) => Partial<Omit<ESchemaType<TSchema>, '_v'>>),
    config?: { lastWriteWins?: boolean },
  ): Effect.Effect<SqliteEntityOp, SQLiteError, SQLiteDatabase> =>
    Effect.gen(function* () {
      const existing = yield* get();
      if (existing.meta._u === '') {
        return yield* Effect.fail(
          SQLiteError.noItemToUpdate(context.table.tableName),
        );
      }
      const fullValue = {
        ...existing.value,
        ...(typeof update === 'function' ? update(existing.value) : update),
      } as ESchemaType<TSchema>;
      const encoded = yield* context.eschema
        .encode(fullValue as any)
        .pipe(
          Effect.mapError((error) =>
            SQLiteError.updateFailed(context.table.tableName, error),
          ),
        );

      return {
        entityName: context.eschema.name,
        operationKind: 'updateOp',
        ...context.key,
        table: context.table,
        apply: (updateId) => ({
          write: {
            type: 'update',
            key: context.key,
            values: {
              _data: JSON.stringify(encoded),
              _v: context.eschema.latestVersion,
              _u: updateId,
            },
            ...(config?.lastWriteWins ? {} : { expectedU: existing.meta._u }),
          } satisfies SqliteWriteOp,
          entity: {
            value: fullValue,
            meta: {
              _e: context.eschema.name,
              _v: context.eschema.latestVersion,
              _u: updateId,
              _d: false,
            },
          },
        }),
      };
    });

  return { getAndUpdateOp } as const;
};
