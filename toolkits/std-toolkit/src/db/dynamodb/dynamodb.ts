import { type Duration, Effect, Layer } from 'effect';
import type {
  SetupOptions,
  SetupOutcome,
  SetupRefused,
  TableMode,
} from '../setup/index.js';
import type { TableDefinition } from '../std-table/definition/index.js';
import type { DatabaseError } from '../std-table/error/index.js';
import {
  contractLayer,
  type OperationFailure,
  type StdTableService,
} from '../std-table/contract/index.js';
import {
  makeDynamoDBClient,
  type DynamoDBCredentialsInput,
} from './client/index.js';
import { makeTableContract } from './table/index.js';
import {
  DynamoDBNativeError,
  ensureDynamoTable,
  getTableDefinition,
  setUpDynamoTable,
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
  readonly layer: Layer.Layer<StdTableService<Name>>;
}

/** Realizes a StdTable on one DynamoDB table. Providing the layer never touches the table. */
const make = <Name extends string>(
  table: DynamoTable<Name>,
  config: DynamoDBConfig,
): DynamoDBTable<Name> => {
  const client = makeDynamoDBClient(config);
  return {
    tableName: config.tableName,
    layer: contractLayer(
      table.logicalName,
      makeTableContract(client, table, config.tableName),
    ),
  };
};

/**
 * Adapter-native: prepares the physical table under its mode. Creates it
 * when it is missing, compares the table with the Stored contract kept
 * inside it, refuses or wipes, adds a new global secondary index in place,
 * reindexes the rows it touches, and records the contract. Any other index
 * change is refused in either mode, since DynamoDB makes it only by
 * replacing the table. `DynamoDB.table` in `@kestack/std-toolkit/alchemy`
 * runs this at deploy.
 */
const setup = (
  table: SetupOptions['table'],
  config: DynamoDBConfig,
  options: {
    readonly mode: TableMode;
    readonly pageSize?: number;
    /** How long to wait for each new global secondary index; 30 minutes by default. */
    readonly indexWait?: Duration.Input;
  },
): Effect.Effect<
  SetupOutcome,
  DynamoDBNativeError | SetupRefused | DatabaseError | OperationFailure
> => {
  const client = makeDynamoDBClient(config);
  return setUpDynamoTable({
    client,
    table,
    tableName: config.tableName,
    mode: options.mode,
    store: makeTableContract(client, table, config.tableName),
    ...(options.pageSize === undefined ? {} : { pageSize: options.pageSize }),
    ...(options.indexWait === undefined
      ? {}
      : { indexWait: options.indexWait }),
  });
};

/**
 * Adapter-native: creates the table with its full topology when it is
 * missing and waits until it is active, with no Stored contract. For
 * DynamoDB Local in tests and stories; `setup` prepares a real table.
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
  setup,
  createTable,
  deleteTable,
  getTableDefinition,
} as const;

export {
  DynamoDBNativeError,
  GlobalIndexNotReady,
  type DynamoTableTopology,
} from './setup/index.js';
