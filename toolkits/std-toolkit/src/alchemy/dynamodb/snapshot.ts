import { Effect, Option, Redacted } from 'effect';
import { isResolved, Resource, type Input } from 'alchemy';
import * as Provider from 'alchemy/Provider';
import {
  DynamoDB as DynamoDBAdapter,
  type DynamoDBConfig,
  type DynamoIndexKeys,
  type DynamoTableKeys,
} from '../../db/dynamodb/index.js';
import { StdTableService } from '../../db/std-table/contract/index.js';
import {
  checkTableSnapshot,
  decodeStoredSnapshot,
  joinTableSnapshot,
  planTableSnapshot,
  readStoredSnapshot,
  SetupRefused,
  type StoredSnapshot,
  type TableMode,
} from '../../db/table-snapshot/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import type { Providers } from '../collection/index.js';

/** What the code asks of one physical DynamoDB table. */
export interface TableSnapshotProps {
  readonly tableName: string;
  readonly mode: TableMode;
  /** The serialized table snapshot. */
  readonly snapshot: unknown;
  /**
   * The order the table declares its local secondary indexes in. The
   * snapshot sorts them by name, but Alchemy replaces a table whose order
   * changes.
   */
  readonly localIndexOrder: readonly string[];
}

/** Checks the code's snapshot against the live table's, before Alchemy changes the table. */
export type SnapshotCheck = Resource<
  'StdToolkit.DynamoDB.SnapshotCheck',
  TableSnapshotProps,
  TableSnapshotProps,
  never,
  Providers
>;

export const SnapshotCheck = Resource<SnapshotCheck>(
  'StdToolkit.DynamoDB.SnapshotCheck',
);

/** Writes the code's snapshot into the live table, once Alchemy has changed it. */
export type SnapshotRecord = Resource<
  'StdToolkit.DynamoDB.SnapshotRecord',
  TableSnapshotProps,
  TableSnapshotProps,
  never,
  Providers
>;

export const SnapshotRecord = Resource<SnapshotRecord>(
  'StdToolkit.DynamoDB.SnapshotRecord',
);

/** What Alchemy replaces a DynamoDB table on when it changes. */
interface Layout {
  readonly topology: TableSnapshot['topology'];
  /**
   * The order the local secondary indexes are declared in; `undefined` for
   * the live table, since DescribeTable lists them in an order of its own.
   */
  readonly localIndexOrder: readonly string[] | undefined;
}

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

// Alchemy adds a global secondary index in place; it makes any other index
// change, and a new primary key, by replacing the table.
const replacesTable = (previous: Layout, current: Layout) =>
  !same(previous.topology.primary, current.topology.primary) ||
  !same(
    previous.topology.localSecondaryIndexes,
    current.topology.localSecondaryIndexes,
  ) ||
  (previous.localIndexOrder !== undefined &&
    !same(previous.localIndexOrder, current.localIndexOrder)) ||
  previous.topology.globalSecondaryIndexes.some(
    (index) =>
      !current.topology.globalSecondaryIndexes.some((next) =>
        same(index, next),
      ),
  );

const byName = (indexes: readonly DynamoIndexKeys[]) =>
  indexes
    .map(({ name, pk, sk }) => ({ name, pk, sk }))
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );

/** The live table's layout, as a snapshot's topology holds it. */
const liveLayout = (keys: DynamoTableKeys): Layout => ({
  topology: {
    primary: { pk: keys.primary.pk, sk: keys.primary.sk },
    localSecondaryIndexes: byName(keys.localSecondaryIndexes),
    globalSecondaryIndexes: byName(keys.globalSecondaryIndexes),
  },
  localIndexOrder: undefined,
});

const layoutOf = (props: TableSnapshotProps) =>
  TableSnapshot.parse(props.snapshot).pipe(
    Effect.map((snapshot): Layout => ({
      topology: snapshot.topology,
      localIndexOrder: props.localIndexOrder,
    })),
  );

// The plan read the same items, so they decode and join.
const storedLayout = (stored: StoredSnapshot) =>
  decodeStoredSnapshot(stored).pipe(
    Effect.flatMap((values) =>
      values === undefined
        ? Effect.succeed(undefined)
        : joinTableSnapshot(values).pipe(
            Effect.map((joined): Layout => ({
              topology: joined.snapshot.topology,
              localIndexOrder: joined.localIndexOrder,
            })),
          ),
    ),
    Effect.orDie,
  );

const refuseReplacement = (
  previous: Layout | undefined,
  current: Layout,
  logicalName: string,
) =>
  previous !== undefined && replacesTable(previous, current)
    ? Effect.fail(new SetupRefused(logicalName, 'replaces-table'))
    : Effect.void;

// DynamoDB is never wiped, so a table with rows and no snapshot keeps them in
// either mode, as one with none does: there is no need to scan for them.
const planOptions = (props: TableSnapshotProps) =>
  ({
    mode: props.mode,
    hasRows: Effect.succeed(false),
    backfill: 'keep',
  }) as const;

// The internal entities have no secondary keys, so the table is read and
// written through its primary key alone.
const openTable = (config: DynamoDBConfig, snapshot: TableSnapshot) =>
  Effect.gen(function* () {
    const service = StdTableService(snapshot.logicalName);
    return (yield* service).contract;
  }).pipe(
    Effect.provide(
      DynamoDBAdapter.make(
        {
          logicalName: snapshot.logicalName,
          primary: snapshot.topology.primary,
          localSecondaryIndexes: {},
          globalSecondaryIndexes: {},
        },
        config,
      ).layer,
    ),
  );

/**
 * Checks a deploy, changing nothing, under ADR 0019's in-place rules: in
 * either mode it refuses a new physical name, a new primary key, any index
 * change but adding a global secondary index, and a new order of the local
 * secondary indexes, since Alchemy makes each by replacing the table. It
 * compares against the live table's own keys, the snapshot the live table
 * keeps, and the props this check last accepted: a table deployed before
 * this check existed, or under lost Alchemy state, has neither of the last
 * two, and a deploy stopped before the snapshot was recorded leaves the
 * table at the props. The live table cannot tell the order its local
 * secondary indexes were declared in, which only the other two hold. Then it
 * plans against the stored snapshot: a persistent table refuses a breaking
 * change and a switch to disposable, and a change a disposable table would
 * be wiped for is refused, since a DynamoDB table is never wiped. A table
 * that does not exist yet passes: its first snapshot is recorded once it
 * does.
 */
export const checkLiveTable = (
  config: DynamoDBConfig,
  props: TableSnapshotProps,
  previous: TableSnapshotProps | undefined,
) =>
  Effect.gen(function* () {
    const snapshot = yield* TableSnapshot.parse(props.snapshot);
    const current: Layout = {
      topology: snapshot.topology,
      localIndexOrder: props.localIndexOrder,
    };
    if (previous !== undefined) {
      if (previous.tableName !== props.tableName)
        return yield* Effect.fail(
          new SetupRefused(previous.tableName, 'renames-table'),
        );
      yield* refuseReplacement(
        yield* layoutOf(previous),
        current,
        snapshot.logicalName,
      );
    }
    const live = yield* DynamoDBAdapter.describeTable(config);
    if (live === undefined) return;
    yield* refuseReplacement(liveLayout(live), current, snapshot.logicalName);
    const stored = yield* readStoredSnapshot(
      yield* openTable(config, snapshot),
    );
    const plan = yield* planTableSnapshot({
      ...planOptions(props),
      current: snapshot,
      stored,
    });
    if (plan.kind === 'wipe')
      return yield* Effect.fail(
        new SetupRefused(snapshot.logicalName, 'replaces-table', plan.changes),
      );
    yield* refuseReplacement(
      yield* storedLayout(stored),
      current,
      snapshot.logicalName,
    );
  });

/**
 * Records the code's snapshot in the live table: the check again, against
 * the items as they are now, then only the items that changed, each under
 * its own condition, in the order `writeTableSnapshot` gives. Returns how the
 * table was found.
 */
export const recordLiveTable = (
  config: DynamoDBConfig,
  props: TableSnapshotProps,
) =>
  Effect.gen(function* () {
    const snapshot = yield* TableSnapshot.parse(props.snapshot);
    const current: Layout = {
      topology: snapshot.topology,
      localIndexOrder: props.localIndexOrder,
    };
    return yield* checkTableSnapshot({
      ...planOptions(props),
      contract: yield* openTable(config, snapshot),
      snapshot,
      localIndexOrder: props.localIndexOrder,
      wipe: () =>
        Effect.fail(new SetupRefused(snapshot.logicalName, 'replaces-table')),
      prepare: (_, stored) =>
        storedLayout(stored).pipe(
          Effect.flatMap((recorded) =>
            refuseReplacement(recorded, current, snapshot.logicalName),
          ),
        ),
    });
  });

/**
 * The physical table under the AWS environment Alchemy's AWS providers
 * deploy with. `@alchemy.run/aws` is loaded only here, when a DynamoDB table
 * deploys: it takes seconds to load, and a stack with no AWS resource
 * never needs it.
 */
const awsTable = (tableName: string) =>
  Effect.gen(function* () {
    const { AWSEnvironment } = yield* Effect.promise(
      () => import('@alchemy.run/aws'),
    );
    const found = yield* Effect.serviceOption(AWSEnvironment);
    if (Option.isNone(found))
      return yield* Effect.die(
        new Error(
          "std-toolkit: DynamoDB.table needs Alchemy's AWS providers. Provide AWS.providers() to std-toolkit's providers().",
        ),
      );
    const environment = yield* found.value;
    const config: DynamoDBConfig = {
      tableName,
      region: environment.region,
      ...(environment.endpoint === undefined
        ? {}
        : { endpoint: environment.endpoint }),
      credentials: () =>
        Effect.runPromise(
          environment.credentials.pipe(
            Effect.map((credentials) => ({
              accessKeyId: Redacted.value(credentials.accessKeyId),
              secretAccessKey: Redacted.value(credentials.secretAccessKey),
              ...(credentials.sessionToken === undefined
                ? {}
                : { sessionToken: Redacted.value(credentials.sessionToken) }),
            })),
          ),
        ),
    };
    return config;
  });

const diffProps = ({
  olds,
  news,
}: {
  readonly olds: TableSnapshotProps;
  readonly news: Input<TableSnapshotProps>;
}) =>
  Effect.succeed(
    !isResolved(news)
      ? undefined
      : same(olds, news)
        ? { action: 'noop' as const }
        : { action: 'update' as const },
  );

export const SnapshotCheckProvider = () =>
  Provider.succeed(SnapshotCheck, {
    diff: diffProps,
    reconcile: ({ news, olds }) =>
      awsTable(news.tableName).pipe(
        Effect.flatMap((config) => checkLiveTable(config, news, olds)),
        Effect.as(news),
      ),
    delete: () => Effect.void,
    read: ({ output }) => Effect.succeed(output),
  });

// Deleting the record leaves the snapshot in the table: it describes the
// table, and goes when the table does.
export const SnapshotRecordProvider = () =>
  Provider.succeed(SnapshotRecord, {
    diff: diffProps,
    reconcile: ({ news }) =>
      awsTable(news.tableName).pipe(
        Effect.flatMap((config) => recordLiveTable(config, news)),
        Effect.as(news),
      ),
    delete: () => Effect.void,
    read: ({ output }) => Effect.succeed(output),
  });
