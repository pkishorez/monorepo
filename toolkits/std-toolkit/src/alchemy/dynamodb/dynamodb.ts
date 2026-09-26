import { Effect } from 'effect';
import * as DynamoDBResource from 'alchemy/AWS/DynamoDB';
import * as Output from 'alchemy/Output';
import {
  DynamoDB as DynamoDBAdapter,
  type DynamoTableTopology,
} from '../../db/dynamodb/index.js';
import type { TableDefinition } from '../../db/index.js';
import { guardTable } from '../snapshot-guard/index.js';

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

const table = (id: string, options: DynamoDBTableOptions) =>
  Effect.gen(function* () {
    const guard = yield* guardTable(`${id}Snapshot`, {
      table: options.table,
      target: options.tableName,
    });
    const tableNameAfterGuard = Output.map(
      guard.snapshot,
      () => options.tableName,
    );
    return yield* DynamoDBResource.Table(id, {
      ...tableProps(
        DynamoDBAdapter.getTableDefinition(options.table),
        options.tableName,
      ),
      tableName: tableNameAfterGuard,
    });
  });

export const DynamoDB = { table } as const;
