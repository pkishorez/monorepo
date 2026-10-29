import { Data, type Duration, Effect, Schedule } from 'effect';
import {
  runSetup,
  type BackfillFailed,
  type SetupOptions,
  type SetupOutcome,
  type SetupRefused,
  type TableMode,
} from '../../setup/index.js';
import type {
  OperationFailure,
  StdTableContract,
} from '../../std-table/contract/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import type { DynamoDBClient } from '../client/index.js';
import { getTableDefinition } from './table-definition.js';
import { dynamoTopology } from './topology.js';

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
 * Creates the table with its full topology when it is missing and waits
 * until it is ACTIVE. An existing table is left as it is.
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

/**
 * Prepares one physical table under its mode (ADR 0021): creates it when it
 * is missing, then runs setup against the Stored contract kept inside it.
 * A new global secondary index is added in place, and ACTIVE before any
 * Backfill runs; every other index change is refused, in either mode.
 */
export const setUpDynamoTable = (options: {
  readonly client: DynamoDBClient;
  readonly table: SetupOptions['table'];
  readonly tableName: string;
  readonly mode: TableMode;
  /** The adapter's StdTable contract over the physical table. */
  readonly store: StdTableContract;
  readonly pageSize?: number;
  /** How long to wait for each new global secondary index; 30 minutes by default. */
  readonly indexWait?: Duration.Input;
}): Effect.Effect<
  SetupOutcome,
  DynamoDBNativeError | SetupRefused | BackfillFailed | OperationFailure
> =>
  Effect.gen(function* () {
    yield* ensureDynamoTable(options.client, options.table, options.tableName);
    return yield* runSetup({
      table: options.table,
      mode: options.mode,
      store: options.store,
      topology: dynamoTopology(
        options.client,
        options.table,
        options.tableName,
        options.indexWait,
      ),
      ...(options.pageSize === undefined ? {} : { pageSize: options.pageSize }),
    });
  });

/** Kept for callers that build the physical projection without a table. */
export { getTableDefinition } from './table-definition.js';
export { GlobalIndexNotReady } from './topology.js';
export type { DynamoTableTopology } from './table-definition.js';
