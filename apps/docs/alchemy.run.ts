import { Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Website } from './src/infra/index.ts';

export type { WorkerEnv } from './src/infra/index.ts';

export default Stack(
  'Docs',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Website,
);
