import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Effect, Schema } from 'effect';
import type { RawRow } from '../../domain/entity-persistence/index.js';
import type { SQLiteEntityTable } from '../sqlite-entity/index.js';
import { SQLiteDatabase } from '../sqlite-database/index.js';
import { SQLiteError } from '../../domain/sqlite-error/index.js';
import {
  singleMetaSchema,
  type SingleEntityType,
  type SQLiteSingleEntityContext,
} from './single-entity-context.js';

export const makeSQLiteSingleEntityReader = <
  TTable extends SQLiteEntityTable,
  TSchema extends AnyUnkeyedESchema,
>(
  context: SQLiteSingleEntityContext<TTable, TSchema>,
) => {
  const parseRow = (
    row: RawRow,
  ): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    SQLiteError,
    SQLiteDatabase
  > =>
    context.eschema.decode({ ...JSON.parse(row._data), _v: row._v }).pipe(
      Effect.mapError((error) =>
        SQLiteError.queryFailed(context.table.tableName, error),
      ),
      Effect.map((value) => ({
        value: value as ESchemaType<TSchema>,
        meta: Schema.decodeUnknownSync(singleMetaSchema)({
          _e: row._e ?? context.eschema.name,
          _v: row._v,
          _u: row._u,
        }),
      })),
    );

  const get = (): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    SQLiteError,
    SQLiteDatabase
  > =>
    Effect.gen(function* () {
      const { Item } = yield* context.table.getItem(context.key);
      if (Item) return yield* parseRow(Item);
      return {
        value: context.defaultValue,
        meta: {
          _e: context.eschema.name,
          _v: context.eschema.latestVersion,
          _u: '',
        },
      };
    }).pipe(
      Effect.withSpan('sqlite.single-entity.get', {
        attributes: { entity: context.eschema.name },
      }),
    );

  return { get } as const;
};
