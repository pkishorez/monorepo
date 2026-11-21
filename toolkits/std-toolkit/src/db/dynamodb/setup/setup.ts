import { Data, Effect, Schedule } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import type { DynamoDBClient, KeySchemaElement } from '../client/index.js';
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

/** One index of a live table: its name and key attributes. */
export interface DynamoIndexKeys {
  readonly name: string;
  readonly pk: string;
  readonly sk: string;
}

/**
 * The keys a live table has, as DescribeTable reports them. It lists the
 * local secondary indexes in an order of its own, not the one they were
 * declared in.
 */
export interface DynamoTableKeys {
  readonly primary: { readonly pk: string; readonly sk: string };
  readonly localSecondaryIndexes: readonly DynamoIndexKeys[];
  readonly globalSecondaryIndexes: readonly DynamoIndexKeys[];
}

// A key DynamoDB leaves out, which a table std-toolkit made always has, reads
// as '', which matches no attribute the code declares.
const keysOf = (schema: readonly KeySchemaElement[] | undefined) => ({
  pk: schema?.find((key) => key.KeyType === 'HASH')?.AttributeName ?? '',
  sk: schema?.find((key) => key.KeyType === 'RANGE')?.AttributeName ?? '',
});

const indexKeys = (
  indexes:
    | readonly {
        readonly IndexName?: string;
        readonly KeySchema?: readonly KeySchemaElement[];
      }[]
    | undefined,
): DynamoIndexKeys[] =>
  (indexes ?? []).map((index) => ({
    name: index.IndexName ?? '',
    ...keysOf(index.KeySchema),
  }));

/** The keys of the live table, in any status; `undefined` when it does not exist. */
export const describeDynamoTable = (
  client: DynamoDBClient,
  tableName: string,
): Effect.Effect<DynamoTableKeys | undefined, DynamoDBNativeError> =>
  client.describeTable({ TableName: tableName }).pipe(
    Effect.map(({ Table }) => ({
      primary: keysOf(Table?.KeySchema),
      localSecondaryIndexes: indexKeys(Table?.LocalSecondaryIndexes),
      globalSecondaryIndexes: indexKeys(Table?.GlobalSecondaryIndexes),
    })),
    Effect.catch((cause) =>
      isTagged(cause, 'ResourceNotFoundException')
        ? Effect.succeed(undefined)
        : Effect.fail(
            new DynamoDBNativeError({ operation: 'describe', cause }),
          ),
    ),
  );

/** Kept for callers that build the physical projection without a table. */
export { getTableDefinition } from './table-definition.js';
export type { DynamoTableTopology } from './table-definition.js';
