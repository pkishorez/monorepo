import { Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { State, Website } from './src/infra/index.ts';

export default Stack(
  'Hands',
  {
    providers: Cloudflare.providers(),
    // Local on disk for a personal stage; Cloudflare's for prod and PRs.
    state: State,
  },
  // The site, and nothing else: the hands are read in the browser.
  Website,
);
