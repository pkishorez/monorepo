import { Effect, Layer } from 'effect';
import type { TableDefinition } from '../std-table/definition/index.js';
import {
  contractLayer,
  type StdTableService,
} from '../std-table/contract/index.js';
import { setupTable, type SetupError } from '../std-table/enforcement/index.js';
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
  | 'logicalName'
  | 'primary'
  | 'localSecondaryIndexes'
  | 'globalSecondaryIndexes'
  | 'snapshot'
>;

export interface DynamoDBTable<Name extends string = string> {
  readonly tableName: string;
  readonly layer: Layer.Layer<StdTableService<Name> | DynamoTableService<Name>>;
  /** Creates the table when missing, then runs table-level enforcement. */
  readonly setup: Effect.Effect<void, DynamoDBNativeError | SetupError>;
  readonly teardown: Effect.Effect<void, DynamoDBNativeError>;
}

const make = <Name extends string>(
  table: DynamoTable<Name>,
  config: DynamoDBConfig,
): DynamoDBTable<Name> => {
  const client = makeDynamoDBClient(config);
  const contract = makeTableContract(client, table, config.tableName);
  return {
    tableName: config.tableName,
    layer: Layer.merge(
      contractLayer(table.logicalName, contract),
      makeNativeService(table.logicalName, client, config.tableName),
    ),
    // Suspended so entities registered after `make` are part of the snapshot.
    setup: Effect.suspend(() =>
      setupTable(contract, table.snapshot(), {
        ensure: ensureDynamoTable(client, table, config.tableName),
        reconcile: Effect.void,
      }),
    ),
    teardown: client.deleteTable({ TableName: config.tableName }).pipe(
      Effect.asVoid,
      Effect.mapError(
        (cause) => new DynamoDBNativeError({ operation: 'teardown', cause }),
      ),
    ),
  };
};

export const DynamoDB = {
  make,
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
