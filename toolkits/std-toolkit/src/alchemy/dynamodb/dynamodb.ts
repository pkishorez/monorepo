import { Effect, Layer, Stream } from 'effect';
import { isResolved, Resource, type Input } from 'alchemy';
import * as Provider from 'alchemy/Provider';
import {
  DynamoDB as DynamoDBAdapter,
  type DynamoDBConfig,
} from '../../db/dynamodb/index.js';
import {
  captureContract,
  runMigration,
  SetupRefused,
  type MigrationEvent,
  type SetupOptions,
  type TableMode,
} from '../../db/setup/index.js';
import type { StdTableService } from '../../db/std-table/contract/index.js';
import type { Providers } from '../deploy-guard/index.js';

type StdTable = SetupOptions['table'];
type DynamoDBCredentialsInput = DynamoDBConfig['credentials'];

interface DynamoDBTableOptions {
  readonly table: StdTable;
  readonly tableName: string;
  /** Required: whether this table's data must survive every schema change. */
  readonly mode: TableMode;
  readonly region: string;
  /**
   * The credentials setup signs with at deploy. Defaults to
   * `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`.
   */
  readonly credentials?: DynamoDBCredentialsInput;
  /** A DynamoDB endpoint other than the region's, such as DynamoDB Local. */
  readonly endpoint?: string;
}

/** What Alchemy keeps in state and diffs: the hash says when to set up again. */
interface DynamoDBTableAttributes {
  readonly tableName: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly mode: TableMode;
  readonly hash: string;
}

interface DynamoDBTableProps extends DynamoDBTableAttributes {
  /**
   * The table itself, which setup needs to reindex its rows, and the
   * credentials. Functions, so Alchemy passes them through as they are and
   * never writes them to state.
   */
  readonly table: () => StdTable;
  readonly credentials: () => DynamoDBCredentialsInput;
}

export type DynamoDBTable = Resource<
  'StdToolkit.DynamoDB.Table',
  DynamoDBTableProps,
  DynamoDBTableAttributes,
  never,
  Providers
>;

export const DynamoDBTable = Resource<DynamoDBTable>(
  'StdToolkit.DynamoDB.Table',
);

const attributesOf = ({
  tableName,
  region,
  endpoint,
  mode,
  hash,
}: DynamoDBTableProps): DynamoDBTableAttributes => ({
  tableName,
  region,
  ...(endpoint === undefined ? {} : { endpoint }),
  mode,
  hash,
});

/**
 * Sets the table up at deploy: refuses a new physical name, then runs
 * DynamoDB setup, which creates a missing table and checks the Stored
 * contract inside it. A refusal fails the deploy with its message.
 */
export const setUpDynamoDBTable = (
  props: DynamoDBTableProps,
  deployed: DynamoDBTableAttributes | undefined,
) =>
  Effect.gen(function* () {
    // A new name would leave the old table, and its data, behind.
    if (deployed !== undefined && deployed.tableName !== props.tableName)
      return yield* Effect.fail(
        new SetupRefused(deployed.tableName, 'renames-table'),
      );
    const config: DynamoDBConfig = {
      tableName: props.tableName,
      region: props.region,
      credentials: props.credentials(),
      ...(props.endpoint === undefined ? {} : { endpoint: props.endpoint }),
    };
    yield* DynamoDBAdapter.setup(props.table(), config, { mode: props.mode });
    return attributesOf(props);
  });

export const diffDynamoDBTable = (
  previous: DynamoDBTableProps,
  current: Input<DynamoDBTableProps>,
) =>
  !isResolved(current)
    ? undefined
    : JSON.stringify(previous) !== JSON.stringify(current)
      ? { action: 'update' as const }
      : { action: 'noop' as const };

export const DynamoDBTableProvider = () =>
  Provider.succeed(DynamoDBTable, {
    diff: ({ olds: previous, news: current }) =>
      Effect.succeed(diffDynamoDBTable(previous, current)),
    reconcile: ({ news: current, output: deployed }) =>
      setUpDynamoDBTable(current, deployed),
    // The data outlives the resource: removing it leaves the table.
    delete: () => Effect.void,
    read: ({ output }) => Effect.succeed(output),
  });

const credentialsFromEnv = (): DynamoDBCredentialsInput => () => {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (accessKeyId === undefined || secretAccessKey === undefined)
    throw new Error(
      'std-toolkit: DynamoDB.table needs credentials: pass `credentials`, or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.',
    );
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken === undefined ? {} : { sessionToken }),
  };
};

/**
 * Creates or updates the DynamoDB table at deploy, under its Stored
 * contract kept inside the table (ADR 0021): setup refuses a persistent
 * table's breaking change, wipes a disposable one's, adds a new global
 * secondary index in place, and reindexes the rows it touches before the
 * new code serves. Any other index change, and a new physical name under the
 * same resource, fails the deploy in either mode, since DynamoDB makes it
 * only by replacing the table; the way past is a new `DynamoDB.table`
 * resource with its own id and table name. Removing the resource leaves
 * the table and its data.
 *
 * Bind the result's `tableName` into the Worker's env and build the adapter
 * from it (`DynamoDB.make(table, { tableName, ... })`). The Worker then
 * depends on this resource, so Alchemy deploys it only after setup and its
 * reindex.
 */
const table = (id: string, options: DynamoDBTableOptions) =>
  Effect.gen(function* () {
    const { record } = yield* captureContract(options.table, options.mode);
    const credentials = options.credentials ?? credentialsFromEnv();
    return yield* DynamoDBTable(id, {
      tableName: options.tableName,
      region: options.region,
      ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
      mode: options.mode,
      hash: record.hash,
      table: () => options.table,
      credentials: () => credentials,
    });
  });

/** A table migration's stream, as `StdTable.migrate` returns it. */
type TableMigration = Stream.Stream<
  MigrationEvent,
  unknown,
  StdTableService<any>
>;

interface MigrationSide {
  readonly table: StdTable;
  readonly credentials: DynamoDBCredentialsInput;
}

interface DynamoDBTableAddress {
  readonly tableName: string;
  readonly region: string;
  readonly endpoint?: string;
}

/** What Alchemy keeps in state: where the migration read from and wrote to. */
interface DynamoDBMigrationAttributes {
  readonly from: DynamoDBTableAddress;
  readonly to: DynamoDBTableAddress;
  /** The new table's physical name. Bind it into the Worker, so the Worker waits for the migration. */
  readonly tableName: string;
}

interface DynamoDBMigrationProps extends DynamoDBMigrationAttributes {
  /**
   * The two tables, their credentials and the migration, passed through as
   * they are and never written to state.
   */
  readonly run: () => {
    readonly from: MigrationSide;
    readonly to: MigrationSide;
    readonly migrate: TableMigration;
  };
}

export type DynamoDBMigration = Resource<
  'StdToolkit.DynamoDB.Migration',
  DynamoDBMigrationProps,
  DynamoDBMigrationAttributes,
  never,
  Providers
>;

export const DynamoDBMigration = Resource<DynamoDBMigration>(
  'StdToolkit.DynamoDB.Migration',
);

/** Runs the table migration against both DynamoDB tables; its failure fails the deploy. */
export const runDynamoDBMigration = (props: DynamoDBMigrationProps) =>
  Effect.gen(function* () {
    const { from, to, migrate } = props.run();
    const layer = Layer.merge(
      DynamoDBAdapter.make(from.table, {
        ...props.from,
        credentials: from.credentials,
      }).layer,
      DynamoDBAdapter.make(to.table, {
        ...props.to,
        credentials: to.credentials,
      }).layer,
    );
    yield* runMigration(
      migrate.pipe(Stream.provide(layer)) as Stream.Stream<
        MigrationEvent,
        unknown
      >,
    );
    return {
      from: props.from,
      to: props.to,
      tableName: props.tableName,
    } satisfies DynamoDBMigrationAttributes;
  });

export const DynamoDBMigrationProvider = () =>
  Provider.succeed(DynamoDBMigration, {
    diff: ({ olds: previous, news: current }) =>
      Effect.succeed(
        !isResolved(current)
          ? undefined
          : JSON.stringify(previous) !== JSON.stringify(current)
            ? { action: 'update' as const }
            : { action: 'noop' as const },
      ),
    reconcile: ({ news: current }) => runDynamoDBMigration(current),
    // The migrated rows outlive the resource: removing it leaves both tables.
    delete: () => Effect.void,
    read: ({ output }) => Effect.succeed(output),
  });

const addressOf = (resource: DynamoDBTable) => ({
  tableName: resource.tableName,
  region: resource.region,
  ...(resource.Props.endpoint === undefined
    ? {}
    : { endpoint: resource.endpoint }),
});

const sideOf = (resource: DynamoDBTable): MigrationSide => ({
  table: resource.Props.table(),
  credentials: resource.Props.credentials(),
});

/**
 * Runs a table migration (`StdTable.migrate`) from one DynamoDB table into
 * a new one at deploy, logging its progress, with the credentials each
 * `DynamoDB.table` resource signs with. It runs after both table resources,
 * so both tables are set up first, and its failure fails the deploy. Once
 * done it is a no-op: the new table's migration row says `done`, so a run
 * on a later deploy is `Skipped`.
 *
 * Bind the result's `tableName` into the Worker that serves the new table,
 * instead of the new table resource's: the Worker then depends on the
 * migration, so Alchemy deploys it only after every row is through. Keep
 * the old table until every stage has migrated, then delete the old table
 * resource, this resource and the `StdTable.migrate` call together.
 */
const migration = (
  id: string,
  options: {
    readonly from: DynamoDBTable;
    readonly to: DynamoDBTable;
    readonly migrate: TableMigration;
  },
) =>
  DynamoDBMigration(id, {
    from: addressOf(options.from),
    to: addressOf(options.to),
    tableName: options.to.tableName,
    run: () => ({
      from: sideOf(options.from),
      to: sideOf(options.to),
      migrate: options.migrate,
    }),
  });

export const DynamoDB = { table, migration } as const;
