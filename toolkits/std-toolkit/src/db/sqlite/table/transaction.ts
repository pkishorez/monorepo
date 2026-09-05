import { Effect, Schema } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import {
  OperationFailure,
  checkFailed,
  type TransactItem,
} from '../../std-table/contract/index.js';
import { SQLiteChangesMismatch, type SQLiteDriver } from '../database/index.js';
import { Statement } from '../statement/index.js';
import type { ItemSchema } from '../item-schema/index.js';

type SQLiteTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export const writeTransaction = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
  schema: ItemSchema,
  requests: readonly TransactItem[],
) =>
  Effect.forEach(requests, (request) =>
    request.kind === 'check'
      ? Effect.succeed(
          Statement.check(tableName, table, request.key, request.condition),
        )
      : Schema.decodeEffect(schema)(request.item).pipe(
          Effect.map((row) =>
            Statement.write(tableName, table, row, request.condition),
          ),
        ),
  ).pipe(
    Effect.flatMap((statements) => database.transaction(statements)),
    Effect.mapError((cause) =>
      cause instanceof SQLiteChangesMismatch
        ? checkFailed(
            requests.length,
            cause.index,
            requests[cause.index]?.condition,
          )
        : new OperationFailure({ cause }),
    ),
  );
