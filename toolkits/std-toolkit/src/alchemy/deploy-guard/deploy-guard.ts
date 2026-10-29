import { Effect } from 'effect';
import { isResolved, Resource, type Input } from 'alchemy';
import * as Provider from 'alchemy/Provider';
import type { TableSource } from '../../snapshot/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import {
  captureContract,
  contractFromSnapshot,
  NO_ROWS,
  planContract,
  rowsOfContract,
  type TableMode,
} from '../../db/setup/index.js';

interface ContractProps {
  readonly mode: TableMode;
  readonly snapshot: unknown;
  /** The physical table, when there is one. A new target starts a fresh contract. */
  readonly target?: string;
}

/** The contract last accepted for one physical target. */
interface TargetContract {
  readonly mode: TableMode;
  readonly hash: string;
  readonly snapshot: unknown;
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

/**
 * Checks a deploy against the Deployed contract by setup's own rules: a
 * persistent table refuses a breaking change and a switch to disposable. Each
 * physical target is checked against its own last contract, so a new
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
    const contract = yield* contractFromSnapshot(
      current.snapshot,
      current.mode,
    );
    const parsed =
      previous === undefined
        ? undefined
        : yield* TableSnapshot.parse(previous.snapshot).pipe(Effect.result);
    yield* planContract({
      current: contract,
      storedMode: previous?.mode,
      read:
        parsed === undefined
          ? { kind: 'read', rows: NO_ROWS }
          : parsed._tag === 'Failure'
            ? { kind: 'unreadable', cause: parsed.failure }
            : { kind: 'read', rows: rowsOfContract(parsed.success, previous!) },
      // The guard holds no rows: with no contract yet, it records one.
      holdsRows: Effect.succeed(false),
    });
    const accepted: TargetContract = {
      mode: current.mode,
      hash: contract.record.hash,
      snapshot: current.snapshot,
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
  physical: { readonly target?: Input<string> } = {},
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
 * Guards a persistent StdTable at deploy, for a table whose setup runs
 * later on a device or an object (IndexedDB, Durable Objects): the deploy
 * fails on a change that setup would refuse against the contract last
 * shipped. Declaring the guard declares the table persistent. D1 and
 * DynamoDB tables need none, since they are set up at deploy. One guard
 * covers every physical table of the StdTable.
 */
const table = (source: TableSource) =>
  guardContract(`${source.logicalName}DeployGuard`, source, 'persistent');

export const DeployGuard = { table } as const;
