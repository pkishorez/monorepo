import { Effect, Schema } from 'effect';
import {
  ConditionFailure,
  conditionFailed,
  OperationFailure,
  type ConditionalPut,
} from '../../std-table/contract/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import type { SQLiteDriver } from '../database/index.js';
import { Statement } from '../statement/index.js';
import type { ItemSchema } from '../item-schema/index.js';

type SQLiteTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export const writeItem = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
  schema: ItemSchema,
  request: ConditionalPut,
) =>
  Schema.decodeEffect(schema)(request.item).pipe(
    Effect.mapError((cause) => new OperationFailure({ cause })),
    Effect.map((row) =>
      Statement.write(tableName, table, row, request.condition),
    ),
    Effect.flatMap((statement) =>
      database.run(statement.sql, statement.parameters).pipe(
        Effect.flatMap((result) =>
          statement.expectedChanges === undefined ||
          result.changes === statement.expectedChanges
            ? Effect.void
            : Effect.fail(conditionFailed()),
        ),
        Effect.mapError((cause) =>
          cause instanceof ConditionFailure
            ? cause
            : new OperationFailure({ cause }),
        ),
      ),
    ),
  );
