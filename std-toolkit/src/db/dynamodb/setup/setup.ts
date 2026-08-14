import { Data, Effect } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import type { DynamoDBClient } from '../client/index.js';
import { getTableDefinition } from './table-definition.js';

export class DynamoDBNativeError extends Data.TaggedError(
  'DynamoDBNativeError',
)<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

export const setupDynamoTable = (
  client: DynamoDBClient,
  table: Pick<
    TableDefinition,
    'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
  >,
  tableName: string,
) =>
  client
    .createTable({
      TableName: tableName,
      ...getTableDefinition(table),
    })
    .pipe(
      Effect.asVoid,
      Effect.mapError(
        (cause) => new DynamoDBNativeError({ operation: 'setup', cause }),
      ),
    );

export { getTableDefinition } from './table-definition.js';
export type { DynamoTableTopology } from './table-definition.js';
