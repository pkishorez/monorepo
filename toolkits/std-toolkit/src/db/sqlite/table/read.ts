import { Effect, Schema } from 'effect';
import {
  OperationFailure,
  type EncodedKey,
} from '../../std-table/contract/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import type { SQLiteDriver, SQLiteRow } from '../database/index.js';
import { Statement } from '../statement/index.js';
import type { ItemSchema } from '../item-schema/index.js';

type SQLiteTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export const encodeRows = (schema: ItemSchema, rows: readonly SQLiteRow[]) =>
  Effect.forEach(rows, (row) => Schema.encodeEffect(schema)(row)).pipe(
    Effect.mapError((cause) => new OperationFailure({ cause })),
  );

export const readItem = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
  schema: ItemSchema,
  key: EncodedKey,
) => {
  const statement = Statement.get(tableName, table);
  return database.all(statement.sql, [key.pk, key.sk]).pipe(
    Effect.mapError((cause) => new OperationFailure({ cause })),
    Effect.flatMap((rows) =>
      rows[0] === undefined
        ? Effect.succeed(null)
        : encodeRows(schema, [rows[0]]).pipe(
            Effect.map((items) => items[0] ?? null),
          ),
    ),
  );
};

export const deleteItem = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
  key: EncodedKey,
) => {
  const statement = Statement.hardDelete(tableName, table);
  return database.run(statement.sql, [key.pk, key.sk]).pipe(
    Effect.asVoid,
    Effect.mapError((cause) => new OperationFailure({ cause })),
  );
};

export const deleteEntityItems = (
  database: SQLiteDriver,
  tableName: string,
  entity: string,
) => {
  const remove = Statement.deleteEntity(tableName);
  return database.run(remove.sql, [entity]).pipe(
    Effect.map(({ changes }) => changes),
    Effect.mapError((cause) => new OperationFailure({ cause })),
  );
};

export const deleteAllItems = (database: SQLiteDriver, tableName: string) => {
  const remove = Statement.deleteAll(tableName);
  return database.run(remove.sql).pipe(
    Effect.map(({ changes }) => changes),
    Effect.mapError((cause) => new OperationFailure({ cause })),
  );
};
