import { Effect, Layer } from 'effect';
import type { TableDefinition } from '../std-table/definition/index.js';
import {
  contractLayer,
  type StdTableService,
} from '../std-table/contract/index.js';
import {
  makeDynamoDBClient,
  type DynamoDBCredentialsInput,
} from './client/index.js';
import {
  batchInsert,
  getItem,
  makeNativeService,
  update,
  type DynamoTableService,
} from './native/index.js';
import { makeTableContract } from './table/index.js';
import {
  DynamoDBNativeError,
  ensureDynamoTable,
  getTableDefinition,
} from './setup/index.js';

export interface DynamoDBConfig {
  readonly tableName: string;
  readonly region: string;
  readonly credentials: DynamoDBCredentialsInput;
  readonly endpoint?: string;
}

type DynamoTable<Name extends string = string> = Pick<
  TableDefinition<Name>,
  'logicalName' | 'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export interface DynamoDBTable<Name extends string = string> {
  readonly tableName: string;
  readonly layer: Layer.Layer<StdTableService<Name> | DynamoTableService<Name>>;
}

/** Realizes a StdTable on one DynamoDB table. Providing the layer never touches the table. */
const make = <Name extends string>(
  table: DynamoTable<Name>,
  config: DynamoDBConfig,
): DynamoDBTable<Name> => {
  const client = makeDynamoDBClient(config);
  return {
    tableName: config.tableName,
    layer: Layer.merge(
      contractLayer(
        table.logicalName,
        makeTableContract(client, table, config.tableName),
      ),
      makeNativeService(table.logicalName, client, config.tableName),
    ),
  };
};

/**
 * Adapter-native: creates the table with its full topology when it is
 * missing and waits until it is active. In production the Alchemy DynamoDB
 * target owns the table; this exists for local DynamoDB in tests and stories.
 */
const createTable = (
  table: DynamoTable,
  config: DynamoDBConfig,
): Effect.Effect<void, DynamoDBNativeError> =>
  ensureDynamoTable(makeDynamoDBClient(config), table, config.tableName);

/** Adapter-native: deletes the physical table. The counterpart of `createTable`. */
const deleteTable = (
  config: DynamoDBConfig,
): Effect.Effect<void, DynamoDBNativeError> =>
  makeDynamoDBClient(config)
    .deleteTable({ TableName: config.tableName })
    .pipe(
      Effect.asVoid,
      Effect.mapError(
        (cause) => new DynamoDBNativeError({ operation: 'teardown', cause }),
      ),
    );

export const DynamoDB = {
  make,
  createTable,
  deleteTable,
  getTableDefinition,
  getItem,
  update,
  batchInsert,
} as const;

export {
  DynamoDBNativeError,
  type DynamoTableTopology,
} from './setup/index.js';
export { dynamoTableService, type DynamoTableService } from './native/index.js';
export {
  buildExpr,
  exprCondition,
  exprFilter,
  exprUpdate,
} from './expression/index.js';
export { marshall, unmarshall } from './attribute-value/index.js';
