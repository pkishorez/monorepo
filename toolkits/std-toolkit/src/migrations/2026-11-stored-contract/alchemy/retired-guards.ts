import { Effect, Layer } from 'effect';
import { Resource, type ResourceClass } from 'alchemy';
import * as Provider from 'alchemy/Provider';

/*
 * The resource types ADR 0019 declared for every D1 and DynamoDB table, and
 * the one before them. Nothing declares them any more; they stay registered
 * so Alchemy can delete the ones a stage's state still holds. Deleting one
 * touches nothing: it held only a copy of a contract.
 */

type Retired<Type extends string> = Resource<
  Type,
  Record<string, unknown>,
  Record<string, unknown>
>;

export const RetiredDeployGuard = Resource<Retired<'StdToolkit.DeployGuard'>>(
  'StdToolkit.DeployGuard',
);

export const RetiredSnapshotGuard = Resource<
  Retired<'StdToolkit.SnapshotGuard'>
>('StdToolkit.SnapshotGuard');

const retiredProvider = <Type extends string>(
  resource: ResourceClass<Retired<Type>>,
) =>
  Provider.succeed(resource, {
    diff: () => Effect.succeed({ action: 'noop' as const }),
    reconcile: () =>
      Effect.die(
        new Error(
          `std-toolkit: ${resource.Type} is retired. Every table keeps its own snapshot, checked by D1.table and DynamoDB.table at deploy (ADR 0020); a stage only deletes the ones it still holds.`,
        ),
      ),
    delete: () => Effect.void,
    read: ({ output }) => Effect.succeed(output),
  });

export const retiredGuardProviders = () =>
  Layer.mergeAll(
    retiredProvider(RetiredDeployGuard),
    retiredProvider(RetiredSnapshotGuard),
  );
