import { Effect } from 'effect';
import * as DynamoDBResource from '@alchemy.run/aws/DynamoDB';
import {
  DynamoDB as DynamoDBAdapter,
  type DynamoTableTopology,
} from '../../db/dynamodb/index.js';
import type { TableDefinition } from '../../db/std-table/definition/index.js';
import type { TableMode } from '../../db/table-snapshot/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import {
  SnapshotCheck,
  SnapshotRecord,
  type TableSnapshotProps,
} from './snapshot.js';

type DynamoTable = Pick<
  TableDefinition,
  | 'logicalName'
  | 'primary'
  | 'localSecondaryIndexes'
  | 'globalSecondaryIndexes'
  | 'registeredEntities'
>;

interface DynamoDBTableOptions {
  readonly table: DynamoTable;
  readonly tableName: string;
  /** Required: whether this table's data must survive every schema change. */
  readonly mode: TableMode;
}

const tableProps = (topology: DynamoTableTopology, tableName: string) => {
  const attributes = Object.fromEntries(
    topology.AttributeDefinitions.map((attribute) => [
      attribute.AttributeName,
      attribute.AttributeType,
    ]),
  );
  const partitionKey = topology.KeySchema.find(
    (key) => key.KeyType === 'HASH',
  )!.AttributeName;
  const sortKey = topology.KeySchema.find(
    (key) => key.KeyType === 'RANGE',
  )?.AttributeName;
  return {
    tableName,
    partitionKey,
    attributes,
    billingMode: topology.BillingMode,
    ...(sortKey === undefined ? {} : { sortKey }),
    ...(topology.LocalSecondaryIndexes === undefined
      ? {}
      : {
          localSecondaryIndexes: topology.LocalSecondaryIndexes.map(
            (index) => ({
              indexName: index.IndexName,
              sortKey: index.KeySchema.find((key) => key.KeyType === 'RANGE')!
                .AttributeName,
              projection: index.Projection,
            }),
          ),
        }),
    ...(topology.GlobalSecondaryIndexes === undefined
      ? {}
      : {
          globalSecondaryIndexes: topology.GlobalSecondaryIndexes.map(
            (index) => {
              const indexSortKey = index.KeySchema.find(
                (key) => key.KeyType === 'RANGE',
              )?.AttributeName;
              return {
                indexName: index.IndexName,
                partitionKey: index.KeySchema.find(
                  (key) => key.KeyType === 'HASH',
                )!.AttributeName,
                ...(indexSortKey === undefined
                  ? {}
                  : { sortKey: indexSortKey }),
                projection: index.Projection,
                ...(index.ProvisionedThroughput === undefined
                  ? {}
                  : { provisionedThroughput: index.ProvisionedThroughput }),
              };
            },
          ),
        }),
  };
};

/** What the check and the record are given: the code's snapshot of the table. */
export const snapshotProps = (options: DynamoDBTableOptions) =>
  TableSnapshot.serialize(TableSnapshot.capture(options.table)).pipe(
    Effect.orDie,
    Effect.map((snapshot): TableSnapshotProps => ({
      tableName: options.tableName,
      mode: options.mode,
      snapshot,
      localIndexOrder: Object.keys(options.table.localSecondaryIndexes),
    })),
  );

/**
 * Creates or updates the DynamoDB table, checked against the snapshot it
 * keeps in its own internal entities (ADR 0020). Three resources, ordered
 * by their outputs: a check reads the snapshot from the live table and fails
 * the deploy on a refusal before Alchemy touches the table; Alchemy's table;
 * and a record that writes the code's snapshot into it once it is changed,
 * or first created. Nothing here replaces or wipes the table: in either
 * mode, a breaking change, a new physical name, or an index change other
 * than adding a global secondary index fails the deploy, and the way past it
 * is a new `DynamoDB.table` resource, with its own id and table name. A
 * deploy stopped before the record leaves the older snapshot, which the next
 * deploy checks against. Returns Alchemy's table.
 */
const table = (id: string, options: DynamoDBTableOptions) =>
  Effect.gen(function* () {
    const topology = DynamoDBAdapter.getTableDefinition(options.table);
    const props = yield* snapshotProps(options);
    const check = yield* SnapshotCheck(`${id}SnapshotCheck`, props);
    const dynamoTable = yield* DynamoDBResource.Table(id, {
      ...tableProps(topology, options.tableName),
      tableName: check.tableName,
    });
    yield* SnapshotRecord(`${id}SnapshotRecord`, {
      ...props,
      tableName: dynamoTable.tableName,
    });
    return dynamoTable;
  });

export const DynamoDB = { table } as const;
