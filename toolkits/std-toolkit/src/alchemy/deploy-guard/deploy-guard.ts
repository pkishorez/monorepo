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
} from '../../db/stored-contract/index.js';

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
}

interface ContractOutput extends ContractProps {
  readonly hash: string;
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
 * A new physical target starts a fresh contract.
 */
export const checkDeploy = (
  deployed: ContractOutput | undefined,
  current: ContractProps,
): Effect.Effect<ContractOutput, unknown> =>
  Effect.gen(function* () {
    // Compared once both are known, at deploy: a target still unresolved
    // when Alchemy planned is resolved here.
    const previous = deployed?.target === current.target ? deployed : undefined;
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
    return { ...current, hash: contract.record.hash };
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
