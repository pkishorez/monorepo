import { Data, Effect, Schedule } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import type { DynamoDBClient } from '../client/index.js';
import { getTableDefinition } from './table-definition.js';

export class DynamoDBNativeError extends Data.TaggedError(
  'DynamoDBNativeError',
)<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

type DynamoTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

const isTagged = (cause: unknown, tag: string): boolean =>
  typeof cause === 'object' &&
  cause !== null &&
  '_tag' in cause &&
  (cause as { _tag: unknown })._tag === tag;

const setupError = (cause: unknown) =>
  new DynamoDBNativeError({ operation: 'setup', cause });

/**
 * Creates the table when it is missing and waits until it is ACTIVE, so the
 * enforcement baseline can be read right after. An existing table is left
 * as it is: topology changes are not reconciled on DynamoDB today.
 */
export const ensureDynamoTable = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
): Effect.Effect<void, DynamoDBNativeError> =>
  client
    .createTable({ TableName: tableName, ...getTableDefinition(table) })
    .pipe(
      Effect.asVoid,
      Effect.catch((cause) =>
        isTagged(cause, 'ResourceInUseException')
          ? Effect.void
          : Effect.fail(cause),
      ),
      Effect.andThen(
        client.describeTable({ TableName: tableName }).pipe(
          Effect.flatMap((output) =>
            output.Table?.TableStatus === 'ACTIVE'
              ? Effect.void
              : Effect.fail({ _tag: 'TableNotActive' as const }),
          ),
          Effect.retry({
            while: (cause) => isTagged(cause, 'TableNotActive'),
            schedule: Schedule.spaced('500 millis'),
            times: 120,
          }),
        ),
      ),
      Effect.mapError(setupError),
    );

/** Kept for callers that build the physical projection without a table. */
export { getTableDefinition } from './table-definition.js';
export type { DynamoTableTopology } from './table-definition.js';
