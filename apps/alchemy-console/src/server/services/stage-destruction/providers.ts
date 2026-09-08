import { Layer } from 'effect';
import * as D1 from 'alchemy/Cloudflare/D1';
import * as KV from 'alchemy/Cloudflare/KV';
import * as R2 from 'alchemy/Cloudflare/R2';
import * as Queues from 'alchemy/Cloudflare/Queues';
import * as Workers from 'alchemy/Cloudflare/Workers';
import * as Workflows from 'alchemy/Cloudflare/Workflows';
import * as DNS from 'alchemy/Cloudflare/DNS';
import * as SecretsStore from 'alchemy/Cloudflare/SecretsStore';
import * as Hyperdrive from 'alchemy/Cloudflare/Hyperdrive';
import { RandomProvider } from 'alchemy/Random';
import { KeyPairProvider } from 'alchemy/KeyPair';

// Compose stock live providers. The default Cloudflare collection also imports
// local emulators and interactive auth, which do not belong in a Worker request.
// Plan.destroy rejects missing providers before Apply can change any resources.
export const providers = () =>
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
    RandomProvider(),
    KeyPairProvider(),
  );
