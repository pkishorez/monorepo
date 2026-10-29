import { Effect, Schedule } from 'effect';
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

const notActive = { _tag: 'IndexNotActive' } as const;

/**
 * Waits until the table and the named index are ACTIVE, so the Backfills
 * that follow can read through it.
 */
const waitUntilActive = (
  client: DynamoDBClient,
  tableName: string,
  indexName: string,
) =>
  client.describeTable({ TableName: tableName }).pipe(
    Effect.flatMap(({ Table }) => {
      const index = Table?.GlobalSecondaryIndexes?.find(
        ({ IndexName }) => IndexName === indexName,
      );
      return Table?.TableStatus === 'ACTIVE' &&
        index?.IndexStatus === 'ACTIVE' &&
        index.Backfilling !== true
        ? Effect.void
        : Effect.fail(notActive);
    }),
    // A new index on a large table can take hours; the deploy waits for it.
    Effect.retry({
      while: (cause) => cause === notActive,
      schedule: Schedule.spaced('2 seconds'),
    }),
  );

/**
 * Makes every global secondary index the table declares ACTIVE before any
 * Backfill runs. One already present may still be creating, from a deploy
 * that stopped after starting it, so it is waited for too, and first:
 * DynamoDB creates one index at a time. Each missing one is then added.
 */
const addMissingGlobalIndexes = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
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
        yield* waitUntilActive(client, tableName, index.IndexName);
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
      yield* waitUntilActive(client, tableName, index.IndexName);
    }
  }).pipe(Effect.mapError((cause) => new OperationFailure({ cause })));

/** The DynamoDB part of setup: what it adds in place, and what it refuses. */
export const dynamoTopology = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
): SetupTopology => ({
  apply: () => addMissingGlobalIndexes(client, table, tableName),
  refuses,
});
