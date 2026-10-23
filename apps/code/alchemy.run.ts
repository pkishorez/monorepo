import { Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Layer } from 'effect';
import { providers as stdToolkitProviders } from '@kestack/std-toolkit/alchemy';
import { State, Website } from './src/deploy/infra/index.ts';

export default Stack(
  'Code',
  {
    // Cloudflare's, and std-toolkit's for the Machines table and its snapshot guard.
    providers: Layer.merge(Cloudflare.providers(), stdToolkitProviders()),
    // Local on disk for a personal stage; Cloudflare's for prod, demo and PRs.
    state: State,
  },
  // The site; the Machines Worker it is handed the URL of comes with it.
  Website,
);
