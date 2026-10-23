import { Effect } from 'effect';
import * as DynamoDBResource from 'alchemy/AWS/DynamoDB';
import * as Output from 'alchemy/Output';
import {
  DynamoDB as DynamoDBAdapter,
  type DynamoTableTopology,
} from '../../db/dynamodb/index.js';
import type { TableDefinition } from '../../db/index.js';
import type { TableMode } from '../../db/stored-contract/index.js';
import { guardContract } from '../deploy-guard/index.js';

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

/**
 * Creates or updates the DynamoDB table. DynamoDB keeps no Stored contract,
 * so its deploy guard is its only check. Nothing here replaces or wipes the
 * table: in either mode, a breaking change, or an index change other than
 * adding a global secondary index, fails the deploy, and the way past it is
 * a new physical table name.
 */
const table = (id: string, options: DynamoDBTableOptions) =>
  Effect.gen(function* () {
    const guard = yield* guardContract(
      `${id}Contract`,
      options.table,
      options.mode,
      { target: options.tableName, inPlaceOnly: true },
    );
    const tableNameAfterGuard = Output.map(guard.hash, () => options.tableName);
    return yield* DynamoDBResource.Table(id, {
      ...tableProps(
        DynamoDBAdapter.getTableDefinition(options.table),
        options.tableName,
      ),
      tableName: tableNameAfterGuard,
    });
  });

export const DynamoDB = { table } as const;
