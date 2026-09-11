import { Effect, Layer, Redacted } from 'effect';
import { CloudflareEnvironment } from 'alchemy/Cloudflare';
import {
  Credentials,
  apiTokenCredentials,
} from '@distilled.cloud/cloudflare/Credentials';
import * as D1 from 'alchemy/Cloudflare/D1';
import * as KV from 'alchemy/Cloudflare/KV';
import * as R2 from 'alchemy/Cloudflare/R2';
import * as Queues from 'alchemy/Cloudflare/Queues';
import * as Workers from 'alchemy/Cloudflare/Workers';
import * as Workflows from 'alchemy/Cloudflare/Workflows';
import * as DNS from 'alchemy/Cloudflare/DNS';
import * as SecretsStore from 'alchemy/Cloudflare/SecretsStore';
import * as Hyperdrive from 'alchemy/Cloudflare/Hyperdrive';
import type { cloudflareSecret } from '../../../shared/contracts/credentials/index.ts';
import { discover, verify } from './discovery.ts';
import { verifyZones } from './zones.ts';

type Secret = typeof cloudflareSecret.Type;
type Row = { props?: unknown; attr?: unknown };

const recordedAccount = (row: Row) => {
  for (const value of [row.props, row.attr]) {
    if (
      value &&
      typeof value === 'object' &&
      'accountId' in value &&
      typeof value.accountId === 'string'
    )
      return value.accountId.toLowerCase();
  }
  return null;
};

/** Everything Console knows about Cloudflare: credentials, state-store discovery, and deleting resources. */
export const cloudflare = {
  kind: 'cloudflare' as const,
  needsRegion: false,
  verify,
  /** Finds the Alchemy state-store Worker in the credential's account. */
  locateStateStore: discover,
  owns: (resourceType: string) => resourceType.startsWith('Cloudflare.'),
  supports: (resourceType: string) => resourceType.startsWith('Cloudflare.'),
  locate: (row: Row) => ({ account: recordedAccount(row), region: null }),
  check: (secret: Secret, _region: string | null, row: Row) =>
    Effect.gen(function* () {
      const account = recordedAccount(row);
      if (account !== null && account !== secret.accountId.toLowerCase())
        return 'This resource belongs to a different Cloudflare account than the selected credential.';
      return yield* verifyZones(secret, row).pipe(
        Effect.as(null),
        Effect.catch(() =>
          Effect.succeed(
            'Could not confirm that this resource’s zone belongs to the selected Cloudflare account.',
          ),
        ),
      );
    }),
  // Compose stock live providers. The default Cloudflare collection also imports
  // local emulators and interactive auth, which do not belong in a Worker request.
  layer: (secret: Secret, _region: string | null) =>
    Layer.mergeAll(
      Workers.LiveWorkerProvider(),
      Workers.WorkerRouteProvider(),
      D1.ProviderLive(),
      KV.ProviderLive(),
      R2.ProviderLive(),
      R2.BucketEventNotificationProvider(),
      R2.BucketSippyProvider(),
      R2.DataCatalogProvider(),
      Queues.SubscriptionProvider(),
      Workflows.ProviderLive(),
      DNS.RecordProvider(),
      SecretsStore.StoreProviderLive(),
      SecretsStore.SecretProviderLive(),
      Hyperdrive.ProviderLive(),
    ).pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(
            Credentials,
            Effect.succeed(apiTokenCredentials({ apiToken: secret.apiToken })),
          ),
          Layer.succeed(
            CloudflareEnvironment,
            Effect.succeed({
              type: 'apiToken',
              apiToken: Redacted.make(secret.apiToken),
              accountId: secret.accountId,
              source: { type: 'env' },
            }),
          ),
        ),
      ),
    ),
};
