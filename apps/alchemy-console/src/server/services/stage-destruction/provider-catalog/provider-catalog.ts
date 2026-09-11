import { Effect, Layer, Option } from 'effect';
import { tryFindProviderByType } from 'alchemy/Provider';
import { stampedMode } from 'alchemy/ProviderMode';
import type { ResourceState } from 'alchemy/State';
import { RandomProvider } from 'alchemy/Random';
import { KeyPairProvider } from 'alchemy/KeyPair';
import type { awsConnection } from '../../../../shared/contracts/state-stores/index.ts';
import * as cloudflare from '../cloudflare/index.ts';
import * as aws from '../aws/index.ts';
import * as forget from '../forget/index.ts';

type Connections = {
  connection: { accountId: string; apiToken: string };
  aws?: typeof awsConnection.Type | null;
  // Resources the user chose to stop tracking instead of deleting.
  forget?: readonly { id: string; type: string }[] | null;
};
// Random and KeyPair live only in state; deleting them drops the row.
const supported = (type: string) =>
  type.startsWith('Cloudflare.') ||
  type === 'AWS.DynamoDB.Table' ||
  ['Alchemy.Random', 'Alchemy.KeyPair'].includes(type);
const forgotten = (input: Connections, row: ResourceState) =>
  !supported(row.resourceType) &&
  !!input.forget?.some(
    (entry) => entry.id === row.fqn && entry.type === row.resourceType,
  );

export const providers = (input: Connections) =>
  Layer.mergeAll(
    cloudflare.providers(input.connection),
    aws.providers(input.aws),
    RandomProvider(),
    KeyPairProvider(),
    // Only unsupported types get a forget-only provider, so a real provider is never shadowed.
    forget.providers(
      (input.forget ?? [])
        .map((entry) => entry.type)
        .filter((type) => !supported(type)),
    ),
  );

export const check = (input: Connections, row: ResourceState) =>
  Effect.gen(function* () {
    const type = row.resourceType;
    const isCloudflare = type.startsWith('Cloudflare.');
    const isDynamo = type === 'AWS.DynamoDB.Table';
    const unsupported = (reason: string) => ({
      readiness: 'unsupported' as const,
      reason,
    });
    const blocked = (reason: string) => ({
      readiness: 'blocked' as const,
      reason,
    });
    if (forgotten(input, row))
      return { readiness: 'ready' as const, reason: null };
    if (!supported(type))
      return unsupported(
        `Console does not support deleting ${type}. Use alchemy destroy from the project.`,
      );
    if (stampedMode(row) === 'local')
      return blocked(
        'This resource was created in local mode and cannot be deleted from Console.',
      );
    if (isDynamo && !input.aws)
      return {
        readiness: 'missing-credentials' as const,
        reason:
          'DynamoDB tables are supported. Add an AWS connection in this store’s connection settings to proceed.',
      };
    if (Option.isNone(yield* tryFindProviderByType(type, 'live')))
      return unsupported(
        `Console has no live provider for ${type}. Use alchemy destroy from the project.`,
      );
    const reason = isCloudflare
      ? yield* cloudflare.check(input.connection, row)
      : isDynamo && input.aws
        ? yield* aws.check(input.aws, row)
        : null;
    return reason
      ? blocked(reason)
      : { readiness: 'ready' as const, reason: null };
  });
