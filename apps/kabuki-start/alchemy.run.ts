import { Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { State, Website } from './src/infra/index.ts';

export type { WorkerEnv } from './src/infra/index.ts';

export default Stack(
  'KabukiStart',
  {
    providers: Cloudflare.providers(),
    // Local on disk for a personal stage; Cloudflare's for prod, demo and PRs.
    state: State,
  },
  Website,
);
