import { Effect } from 'effect';
import { isResolved, Resource, type Input } from 'alchemy';
import * as Provider from 'alchemy/Provider';
import type { TableDefinition } from '../../db/index.js';
import {
  SnapshotIncompatible,
  TableSnapshot,
  TableSnapshotESchema,
} from '../../snapshot/index.js';

/** What a deploy target needs from a StdTable: its topology and registered entities. */
export type DeployableTable = Pick<
  TableDefinition,
  | 'logicalName'
  | 'primary'
  | 'localSecondaryIndexes'
  | 'globalSecondaryIndexes'
  | 'registeredEntities'
>;

export interface SnapshotGuardProps {
  /** The physical thing the snapshot describes, such as a table name or database id. A change replaces the guard and starts a fresh baseline. */
  readonly target: string;
  /** The table snapshot in its stored, stamped JSON form. */
  readonly snapshot: unknown;
}

export type SnapshotGuardAttributes = SnapshotGuardProps;

/**
 * Keeps the last accepted table snapshot in Alchemy state and refuses a
 * deploy whose new snapshot is not upgradable from it. This is the only
 * baseline the toolkit keeps: nothing lives in the table, and nothing runs
 * at request time.
 */
export type SnapshotGuard = Resource<
  'StdToolkit.SnapshotGuard',
  SnapshotGuardProps,
  SnapshotGuardAttributes,
  never,
  Providers
>;

export const SnapshotGuard = Resource<SnapshotGuard>(
  'StdToolkit.SnapshotGuard',
);

/**
 * The provider collection for every std-toolkit resource. Resources require
 * the collection rather than their own provider, which is what a stack's
 * `providers` layer accepts.
 */
export class Providers extends Provider.ProviderCollection<Providers>()(
  'StdToolkit',
) {}

const stable = (value: unknown): string => JSON.stringify(value);

const REJECTED = new Set(['breaking', 'unverifiable']);

/**
 * Decides whether `next` may replace the accepted snapshot. The first
 * snapshot for a target is recorded as is; after that a breaking or
 * unverifiable change fails, and a change that needs a backfill is accepted
 * with a warning.
 */
export const acceptSnapshot = (
  accepted: SnapshotGuardAttributes | undefined,
  next: SnapshotGuardProps,
) =>
  Effect.gen(function* () {
    const current = yield* TableSnapshot.parse(next.snapshot);
    if (accepted === undefined || accepted.target !== next.target) {
      yield* Effect.logInfo(
        `std-toolkit: recorded the first snapshot of table "${current.logicalName}" for ${next.target}`,
      );
      return { target: next.target, snapshot: next.snapshot };
    }
    const previous = yield* TableSnapshot.parse(accepted.snapshot);
    const changes = TableSnapshot.diff(previous, current);
    if (!TableSnapshot.isUpgradable(changes)) {
      const rejected = changes.filter(({ impact }) => REJECTED.has(impact));
      yield* Effect.logError(
        `std-toolkit: table "${current.logicalName}" cannot be upgraded from its last deployed snapshot:\n${TableSnapshot.renderChanges(rejected)}`,
      );
      return yield* Effect.fail(new SnapshotIncompatible(rejected));
    }
    for (const change of changes) {
      if (change.impact === 'requires-backfill') {
        yield* Effect.logWarning(
          `std-toolkit: table "${current.logicalName}": ${TableSnapshot.renderChanges([change])}`,
        );
      }
    }
    return { target: next.target, snapshot: next.snapshot };
  });

export const SnapshotGuardProvider = () =>
  Provider.succeed(SnapshotGuard, {
    diff: ({ olds, news }) =>
      Effect.succeed(
        !isResolved(news)
          ? undefined
          : olds.target !== news.target
            ? { action: 'replace' as const }
            : stable(olds.snapshot) !== stable(news.snapshot)
              ? { action: 'update' as const }
              : { action: 'noop' as const },
      ),
    reconcile: ({ news, output }) => acceptSnapshot(output, news),
    delete: () => Effect.void,
    read: ({ output }) => Effect.succeed(output),
  });

/** Registers a guard for `table` under `id`, capturing its snapshot now. */
export const guardTable = (
  id: string,
  options: { readonly table: DeployableTable; readonly target: Input<string> },
) =>
  Effect.gen(function* () {
    const snapshot = yield* TableSnapshotESchema.encode(
      TableSnapshot.capture(options.table),
    ).pipe(Effect.orDie);
    return yield* SnapshotGuard(id, { target: options.target, snapshot });
  });
