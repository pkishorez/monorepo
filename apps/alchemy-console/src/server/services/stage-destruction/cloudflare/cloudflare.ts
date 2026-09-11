import { Effect, Layer, Redacted } from 'effect';
import { CloudflareEnvironment } from 'alchemy/Cloudflare';
import {
  Credentials,
  apiTokenCredentials,
} from '@distilled.cloud/cloudflare/Credentials';
import { verifyZones } from './zones.ts';
import * as D1 from 'alchemy/Cloudflare/D1';
import * as KV from 'alchemy/Cloudflare/KV';
import * as R2 from 'alchemy/Cloudflare/R2';
import * as Queues from 'alchemy/Cloudflare/Queues';
import * as Workers from 'alchemy/Cloudflare/Workers';
import * as Workflows from 'alchemy/Cloudflare/Workflows';
import * as DNS from 'alchemy/Cloudflare/DNS';
import * as SecretsStore from 'alchemy/Cloudflare/SecretsStore';
import * as Hyperdrive from 'alchemy/Cloudflare/Hyperdrive';

// Compose stock live providers. The default Cloudflare collection also imports
// local emulators and interactive auth, which do not belong in a Worker request.
// Plan.destroy rejects missing providers before Apply can change any resources.
export const providers = (connection: {
  accountId: string;
  apiToken: string;
}) =>
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
          Effect.succeed(
            apiTokenCredentials({ apiToken: connection.apiToken }),
          ),
        ),
        Layer.succeed(
          CloudflareEnvironment,
          Effect.succeed({
            type: 'apiToken',
            apiToken: Redacted.make(connection.apiToken),
            accountId: connection.accountId,
            source: { type: 'env' },
          }),
        ),
      ),
    ),
  );

export const check = (
  connection: { accountId: string; apiToken: string },
  row: { props?: unknown; attr?: unknown },
) =>
  Effect.gen(function* () {
    for (const value of [row.props, row.attr]) {
      if (
        value &&
        typeof value === 'object' &&
        'accountId' in value &&
        typeof value.accountId === 'string' &&
        value.accountId !== connection.accountId
      )
        return 'This resource belongs to a different Cloudflare account than this connection.';
    }
    return yield* verifyZones(connection, row).pipe(
      Effect.as(null),
      Effect.catch(() =>
        Effect.succeed(
          'Could not verify this resource’s Cloudflare zone and account. Check the saved token and zone access.',
        ),
      ),
    );
  });
