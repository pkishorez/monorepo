import { Effect } from 'effect';
import { isResolved, Resource, type Input } from 'alchemy';
import * as Provider from 'alchemy/Provider';
import type { TableSource } from '../../snapshot/index.js';
import {
  type SnapshotChange,
  SnapshotIncompatible,
  TableSnapshot,
  TableSnapshotESchema,
} from '../../snapshot/index.js';

interface SnapshotGuardProps {
  /** The physical table. A new target starts a fresh baseline. */
  readonly target: string;
  readonly snapshot: unknown;
}

/**
 * Remembers the last deployed table snapshot in Alchemy state and fails a
 * deploy whose snapshot cannot be upgraded from it.
 */
export type SnapshotGuard = Resource<
  'StdToolkit.SnapshotGuard',
  SnapshotGuardProps,
  SnapshotGuardProps,
  never,
  Providers
>;

export const SnapshotGuard = Resource<SnapshotGuard>(
  'StdToolkit.SnapshotGuard',
);

export class Providers extends Provider.ProviderCollection<Providers>()(
  'StdToolkit',
) {}

const failOnBreaking = (
  logicalName: string,
  changes: readonly SnapshotChange[],
) => {
  const rejected = changes.filter(
    ({ impact }) => impact === 'breaking' || impact === 'unverifiable',
  );
  if (rejected.length === 0) {
    return Effect.void;
  }
  return Effect.logError(
    `std-toolkit: table "${logicalName}" cannot be upgraded from its last deployed snapshot:\n${TableSnapshot.renderChanges(rejected)}`,
  ).pipe(Effect.andThen(Effect.fail(new SnapshotIncompatible(rejected))));
};

const warnOnBackfill = (
  logicalName: string,
  changes: readonly SnapshotChange[],
) =>
  Effect.forEach(
    changes.filter(({ impact }) => impact === 'requires-backfill'),
    (change) =>
      Effect.logWarning(
        `std-toolkit: table "${logicalName}": ${TableSnapshot.renderChanges([change])}`,
      ),
    { discard: true },
  );

export const checkUpgrade = (
  previousSnapshot: unknown,
  currentSnapshot: unknown,
) =>
  Effect.gen(function* () {
    const current = yield* TableSnapshot.parse(currentSnapshot);
    if (previousSnapshot === undefined) {
      yield* Effect.logInfo(
        `std-toolkit: recorded the first snapshot of table "${current.logicalName}"`,
      );
      return;
    }
    const previous = yield* TableSnapshot.parse(previousSnapshot);
    const changes = TableSnapshot.diff(previous, current);
    yield* failOnBreaking(current.logicalName, changes);
    yield* warnOnBackfill(current.logicalName, changes);
  });

export const SnapshotGuardProvider = () =>
  Provider.succeed(SnapshotGuard, {
    diff: ({ olds: previous, news: current }) =>
      Effect.succeed(
        !isResolved(current)
          ? undefined
          : previous.target !== current.target
            ? { action: 'replace' as const }
            : JSON.stringify(previous.snapshot) !==
                JSON.stringify(current.snapshot)
              ? { action: 'update' as const }
              : { action: 'noop' as const },
      ),
    reconcile: ({ news: current, output: deployed }) =>
      checkUpgrade(deployed?.snapshot, current.snapshot).pipe(
        Effect.as(current),
      ),
    delete: () => Effect.void,
    read: ({ output }) => Effect.succeed(output),
  });

export const guardTable = (
  id: string,
  options: { readonly table: TableSource; readonly target: Input<string> },
) =>
  Effect.gen(function* () {
    const snapshot = yield* TableSnapshotESchema.encode(
      TableSnapshot.capture(options.table),
    ).pipe(Effect.orDie);
    return yield* SnapshotGuard(id, { target: options.target, snapshot });
  });
