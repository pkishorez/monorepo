import { Effect } from 'effect';
import { isResolved, Resource } from 'alchemy';
import * as Provider from 'alchemy/Provider';
import type { TableSource } from '../../snapshot/index.js';
import {
  captureContract,
  contractFromSnapshot,
  planSetup,
  type TableMode,
} from '../../db/stored-contract/index.js';

interface ContractProps {
  readonly mode: TableMode;
  readonly snapshot: unknown;
}

interface ContractOutput extends ContractProps {
  readonly hash: string;
  /**
   * Bumped each time a disposable table takes a change its stored rows
   * cannot, so a target that has no setup of its own replaces the table.
   */
  readonly generation: number;
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

/**
 * Checks a deploy against the Deployed contract: a persistent table refuses
 * a breaking change and a switch to disposable; a disposable one moves to
 * the next generation on a change its rows cannot take.
 */
export const checkDeploy = (
  deployed: ContractOutput | undefined,
  current: ContractProps,
): Effect.Effect<ContractOutput, unknown> =>
  Effect.gen(function* () {
    const contract = yield* contractFromSnapshot(
      current.snapshot,
      current.mode,
    );
    const plan = yield* planSetup({
      current: contract,
      stored: deployed,
      loadStoredSnapshot: Effect.succeed(deployed?.snapshot),
    });
    const generation = deployed?.generation ?? 0;
    return {
      ...current,
      hash: contract.record.hash,
      generation: plan.kind === 'wipe' ? generation + 1 : generation,
    };
  });

export const DeployGuardProvider = () =>
  Provider.succeed(DeployGuardResource, {
    diff: ({ olds: previous, news: current }) =>
      Effect.succeed(
        !isResolved(current)
          ? undefined
          : JSON.stringify(previous) !== JSON.stringify(current)
            ? { action: 'update' as const }
            : { action: 'noop' as const },
      ),
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
) =>
  Effect.gen(function* () {
    const { record } = yield* captureContract(table, mode);
    return yield* DeployGuardResource(`${id}${SNAPSHOT_FORMAT}`, {
      mode,
      snapshot: record.snapshot,
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
