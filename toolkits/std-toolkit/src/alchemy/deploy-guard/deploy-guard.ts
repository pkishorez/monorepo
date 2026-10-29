import { Effect } from 'effect';
import { isResolved, Resource, type Input } from 'alchemy';
import * as Provider from 'alchemy/Provider';
import type { TableSource } from '../../snapshot/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import {
  captureContract,
  contractFromSnapshot,
  planSetup,
  SetupRefused,
  type TableMode,
} from '../../db/setup/index.js';

interface ContractProps {
  readonly mode: TableMode;
  readonly snapshot: unknown;
  /** The physical table, when there is one. A new target starts a fresh contract. */
  readonly target?: string;
  /**
   * The target has no setup to wipe it, and Alchemy changes it in place or
   * replaces it (DynamoDB). Every change that would replace or wipe it is
   * refused in either mode: the way past one is a new physical table name.
   */
  readonly inPlaceOnly?: boolean;
  /**
   * The order the target was given its local secondary indexes in. The
   * snapshot sorts them by name, but DynamoDB replaces a table whose order
   * changes, so an in-place-only target refuses a new order.
   */
  readonly localIndexOrder?: readonly string[];
}

/** The contract last accepted for one physical target. */
interface TargetContract {
  readonly mode: TableMode;
  readonly hash: string;
  readonly snapshot: unknown;
  readonly localIndexOrder?: readonly string[];
}

interface ContractOutput extends ContractProps {
  readonly hash: string;
  /**
   * Every target's own contract, by target. A move to a new target keeps
   * the old one's, so moving back is still checked against its data.
   */
  readonly targets: Readonly<Record<string, TargetContract>>;
}

export type DeployGuard = Resource<
  'StdToolkit.DeployGuard',
  ContractProps,
  ContractOutput,
  never,
  Providers
>;

export const DeployGuardResource = Resource<DeployGuard>(
  'StdToolkit.DeployGuard',
);

/**
 * The snapshot guard the deploy guard replaced. Nothing declares one; it is
 * registered only so Alchemy can delete the rows a stage still holds.
 */
export type RetiredSnapshotGuard = Resource<
  'StdToolkit.SnapshotGuard',
  Record<string, unknown>,
  Record<string, unknown>,
  never,
  Providers
>;

export const RetiredSnapshotGuardResource = Resource<RetiredSnapshotGuard>(
  'StdToolkit.SnapshotGuard',
);

export class Providers extends Provider.ProviderCollection<Providers>()(
  'StdToolkit',
) {}

const sameIndexes = (
  left: TableSnapshot['topology']['localSecondaryIndexes'],
  right: TableSnapshot['topology']['localSecondaryIndexes'],
) => JSON.stringify(left) === JSON.stringify(right);

// DynamoDB adds a global secondary index in place; any other index change
// is made by replacing the table.
const replacesTable = (previous: TableSnapshot, current: TableSnapshot) =>
  !sameIndexes(
    previous.topology.localSecondaryIndexes,
    current.topology.localSecondaryIndexes,
  ) ||
  previous.topology.globalSecondaryIndexes.some(
    (index) =>
      !current.topology.globalSecondaryIndexes.some((next) =>
        sameIndexes([index], [next]),
      ),
  );

/**
 * Checks a deploy against the Deployed contract: a persistent table refuses
 * a breaking change and a switch to disposable. A target that is changed in
 * place only also refuses every change that would replace or wipe it.
 * Each physical target is checked against its own last contract, so a new
 * target starts fresh and an old one is never forgotten.
 */
export const checkDeploy = (
  deployed: ContractOutput | undefined,
  current: ContractProps,
): Effect.Effect<ContractOutput, unknown> =>
  Effect.gen(function* () {
    // Looked up at deploy, once the target is known: one still unresolved
    // when Alchemy planned is resolved here.
    const target = current.target ?? '';
    const previous = deployed?.targets[target];
    // DynamoDB replaces a table whose name changes under the same resource,
    // deleting the old one; a new name belongs to a new resource.
    if (
      current.inPlaceOnly === true &&
      deployed !== undefined &&
      (deployed.target ?? '') !== target
    )
      return yield* Effect.fail(
        new SetupRefused(current.target ?? '', 'renames-table'),
      );
    const contract = yield* contractFromSnapshot(
      current.snapshot,
      current.mode,
    );
    const plan = yield* planSetup({
      current: contract,
      stored: previous,
      loadStoredSnapshot: Effect.succeed(previous?.snapshot),
      ...(current.inPlaceOnly === true ? { backfill: 'keep' as const } : {}),
    });
    if (current.inPlaceOnly === true && previous !== undefined) {
      const refused =
        plan.kind === 'wipe' ||
        JSON.stringify(previous.localIndexOrder ?? []) !==
          JSON.stringify(current.localIndexOrder ?? []) ||
        (plan.kind === 'apply' &&
          replacesTable(
            yield* TableSnapshot.parse(previous.snapshot),
            contract.snapshot,
          ));
      if (refused)
        return yield* Effect.fail(
          new SetupRefused(
            contract.logicalName,
            'replaces-table',
            plan.kind === 'wipe' ? plan.changes : [],
          ),
        );
    }
    const accepted: TargetContract = {
      mode: current.mode,
      hash: contract.record.hash,
      snapshot: current.snapshot,
      ...(current.localIndexOrder === undefined
        ? {}
        : { localIndexOrder: current.localIndexOrder }),
    };
    return {
      ...current,
      hash: contract.record.hash,
      targets: { ...deployed?.targets, [target]: accepted },
    };
  });

export const diffContract = (
  previous: ContractProps,
  current: Input<ContractProps>,
) =>
  !isResolved(current)
    ? undefined
    : JSON.stringify(previous) !== JSON.stringify(current)
      ? { action: 'update' as const }
      : { action: 'noop' as const };

export const DeployGuardProvider = () =>
  Provider.succeed(DeployGuardResource, {
    diff: ({ olds: previous, news: current }) =>
      Effect.succeed(diffContract(previous, current)),
    reconcile: ({ news: current, output: deployed }) =>
      checkDeploy(deployed, current),
    delete: () => Effect.void,
    read: ({ output }) => Effect.succeed(output),
  });

export const RetiredSnapshotGuardProvider = () =>
  Provider.succeed(RetiredSnapshotGuardResource, {
    diff: () => Effect.succeed({ action: 'noop' as const }),
    reconcile: () =>
      Effect.die(
        new Error(
          'std-toolkit: the snapshot guard is retired; use DeployGuard.',
        ),
      ),
    delete: () => Effect.void,
    read: ({ output }) => Effect.succeed(output),
  });

/**
 * The stored snapshot document format. Bumping it gives every guard a new
 * resource id, so Alchemy deletes the guard holding a contract in the old
 * format and records a fresh one, instead of failing to read it.
 */
const SNAPSHOT_FORMAT = 'V2';

/** Registers the contract resource for one table, under a given mode. */
export const guardContract = (
  id: string,
  table: TableSource,
  mode: TableMode,
  physical: {
    readonly target?: Input<string>;
    readonly inPlaceOnly?: boolean;
    readonly localIndexOrder?: readonly string[];
  } = {},
) =>
  Effect.gen(function* () {
    const { record } = yield* captureContract(table, mode);
    return yield* DeployGuardResource(`${id}${SNAPSHOT_FORMAT}`, {
      mode,
      snapshot: record.snapshot,
      ...physical,
    });
  });

/**
 * Guards a persistent StdTable at deploy: the deploy fails when the table's
 * contract breaks the one last shipped. Declaring the guard declares the
 * table persistent. D1 and DynamoDB tables include their own; declare this
 * for a table Alchemy does not create, such as an IndexedDB or Durable
 * Object table. One guard covers every physical table of the StdTable.
 */
const table = (source: TableSource) =>
  guardContract(`${source.logicalName}DeployGuard`, source, 'persistent');

export const DeployGuard = { table } as const;
