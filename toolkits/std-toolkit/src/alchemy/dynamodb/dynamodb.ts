import { Effect } from 'effect';
import * as DynamoDBResource from 'alchemy/AWS/DynamoDB';
import * as Output from 'alchemy/Output';
import type { DeployableTable } from '../snapshot-guard/index.js';
import {
  DynamoDB as DynamoDBAdapter,
  type DynamoTableTopology,
} from '../../db/dynamodb/index.js';
import { guardTable } from '../snapshot-guard/index.js';

export interface DynamoDBTableOptions {
  readonly table: DeployableTable;
  readonly tableName: string;
}

/** Projects a StdTable's topology onto the props of Alchemy's DynamoDB table resource. */
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
 * Deploys a StdTable on DynamoDB: the snapshot guard accepts the table's
 * contract before the table resource creates or reconciles its indexes.
 * Returns the table resource for bindings.
 */
const table = (id: string, options: DynamoDBTableOptions) =>
  Effect.gen(function* () {
    const guard = yield* guardTable(`${id}Snapshot`, {
      table: options.table,
      target: options.tableName,
    });
    const resource = yield* DynamoDBResource.Table(id, {
      ...tableProps(
        DynamoDBAdapter.getTableDefinition(options.table),
        options.tableName,
      ),
      tableName: Output.map(guard.snapshot, () => options.tableName),
    });
    return resource;
  });

export const DynamoDB = { table } as const;
