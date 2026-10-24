import { Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Layer } from 'effect';
import { providers as stdToolkitProviders } from '@kestack/std-toolkit/alchemy';
import { State, Website } from './src/infra/index.ts';

export default Stack(
  'KabukiStart',
  {
    // Cloudflare's, and std-toolkit's for the Pocket table and its deploy guard.
    providers: Layer.merge(Cloudflare.providers(), stdToolkitProviders()),
    // Local on disk for a personal stage; Cloudflare's for prod, demo and PRs.
    state: State,
  },
  // The site; the API Workers it is handed the URLs of come with it.
  Website,
);
