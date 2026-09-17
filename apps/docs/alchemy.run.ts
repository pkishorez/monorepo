import { Stack } from 'alchemy';
import { providers as awsProviders } from 'alchemy/AWS';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Layer from 'effect/Layer';
import { Website } from './src/infra/index.ts';

export type { WorkerEnv } from './src/infra/index.ts';

export default Stack(
  'Docs',
  {
    providers: Layer.mergeAll(Cloudflare.providers(), awsProviders()),
    state: Cloudflare.state(),
  },
  Website,
);
