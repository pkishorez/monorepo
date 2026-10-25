import { Stack } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { State } from '@kestack/web-platform/app/alchemy';
import { Website } from './src/deploy/infra/index.ts';

export default Stack(
  'Code',
  {
    // Cloudflare's: the site is one Worker.
    providers: Cloudflare.providers(),
    // Local on disk for a personal stage; Cloudflare's for prod, demo and PRs.
    state: State,
  },
  // The site; the Machines it lists come from Cloud Connect, in @kestack/connect.
  Website,
);
