import { Data, type Duration, Effect, Schedule } from 'effect';
import type { SnapshotChange } from '../../../snapshot/index.js';
import type { SetupTopology } from '../../setup/index.js';
import { OperationFailure } from '../../std-table/contract/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import type { DynamoDBClient } from '../client/index.js';
import { getTableDefinition } from './table-definition.js';

type DynamoTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

// DynamoDB adds a global secondary index in place. Every other index change
// is made only by replacing the table, which deletes its rows.
const refuses = (change: SnapshotChange) => {
  switch (change.subject.kind) {
    case 'primary-index':
    case 'local-secondary-index':
      return 'replaces-table' as const;
    case 'global-secondary-index':
      return change.action === 'added'
        ? undefined
        : ('replaces-table' as const);
    default:
      return undefined;
  }
};

/**
 * A global secondary index setup added or found did not become ACTIVE: it
 * is gone, in a state that never ends in ACTIVE, such as DELETING, or still
 * creating when the wait ran out.
 */
export class GlobalIndexNotReady extends Data.TaggedError(
  'GlobalIndexNotReady',
)<{
  readonly tableName: string;
  readonly indexName: string;
  /** The index's last status, `missing`, or `timed-out`. */
  readonly state: string;
  readonly message: string;
}> {}

const notReady = (tableName: string, indexName: string, state: string) =>
  new GlobalIndexNotReady({
    tableName,
    indexName,
    state,
    message:
      state === 'timed-out'
        ? `std-toolkit: global secondary index "${indexName}" on DynamoDB table "${tableName}" was still creating when setup stopped waiting. Nothing was recorded; deploy again to keep waiting, or raise the index wait.`
        : `std-toolkit: global secondary index "${indexName}" on DynamoDB table "${tableName}" is ${state === 'missing' ? 'missing' : state}, so it will not become ACTIVE. Nothing was recorded.`,
  });

const notActive = { _tag: 'IndexNotActive' } as const;
type WaitFailure = GlobalIndexNotReady | typeof notActive;

/** How long setup waits for one index by default. */
export const INDEX_WAIT = '30 minutes' satisfies Duration.Input;

/**
 * Waits until the table and the named index are ACTIVE, so the reindex
 * that follows writes into it. An index that is missing, or in a state
 * other than CREATING, UPDATING or ACTIVE, fails at once; one still not
 * ACTIVE after `timeout` fails then.
 */
const waitUntilActive = (
  client: DynamoDBClient,
  tableName: string,
  indexName: string,
  timeout: Duration.Input,
) =>
  client.describeTable({ TableName: tableName }).pipe(
    Effect.flatMap(({ Table }): Effect.Effect<void, WaitFailure> => {
      const index = Table?.GlobalSecondaryIndexes?.find(
        ({ IndexName }) => IndexName === indexName,
      );
      if (index === undefined)
        return Effect.fail(notReady(tableName, indexName, 'missing'));
      const status = index.IndexStatus;
      // UPDATING (a throughput change, say) returns to ACTIVE on its own.
      if (status === 'DELETING')
        return Effect.fail(notReady(tableName, indexName, status));
      return Table?.TableStatus === 'ACTIVE' &&
        status === 'ACTIVE' &&
        index.Backfilling !== true
        ? Effect.void
        : Effect.fail(notActive);
    }),
    // A new index on a large table can take hours; the deploy waits for it,
    // up to `timeout`.
    Effect.retry({
      while: (cause) => cause === notActive,
      schedule: Schedule.spaced('2 seconds'),
    }),
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () => Effect.fail(notReady(tableName, indexName, 'timed-out')),
    }),
  );

/**
 * Makes every global secondary index the table declares ACTIVE before the
 * reindex. One already present may still be creating, from a deploy
 * that stopped after starting it, so it is waited for too, and first:
 * DynamoDB creates one index at a time. Each missing one is then added.
 */
const addMissingGlobalIndexes = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
  timeout: Duration.Input,
) =>
  Effect.gen(function* () {
    const definition = getTableDefinition(table);
    const described = yield* client.describeTable({ TableName: tableName });
    const present = new Set(
      (described.Table?.GlobalSecondaryIndexes ?? []).map(
        ({ IndexName }) => IndexName,
      ),
    );
    const declared = definition.GlobalSecondaryIndexes ?? [];
    for (const index of declared)
      if (present.has(index.IndexName))
        yield* waitUntilActive(client, tableName, index.IndexName, timeout);
    for (const index of declared) {
      if (present.has(index.IndexName)) continue;
      yield* client.updateTable({
        TableName: tableName,
        AttributeDefinitions: definition.AttributeDefinitions,
        GlobalSecondaryIndexUpdates: [
          {
            Create: {
              IndexName: index.IndexName,
              KeySchema: index.KeySchema,
              Projection: index.Projection,
            },
          },
        ],
      });
      yield* waitUntilActive(client, tableName, index.IndexName, timeout);
    }
  }).pipe(Effect.mapError((cause) => new OperationFailure({ cause })));

/** The DynamoDB part of setup: what it adds in place, and what it refuses. */
export const dynamoTopology = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
  /** How long to wait for each index to become ACTIVE. */
  indexWait: Duration.Input = INDEX_WAIT,
): SetupTopology => ({
  apply: () => addMissingGlobalIndexes(client, table, tableName, indexWait),
  refuses,
});
