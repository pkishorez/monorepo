import { Stack } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Layer } from 'effect';
import { providers as stdToolkitProviders } from '@kestack/std-toolkit/alchemy';
import { State } from '@kestack/web-platform/app/alchemy';
import { Website } from './src/deploy/infra/index.ts';

export default Stack(
  'Code',
  {
    // std-toolkit's, for the Machines table and its deploy guard, over
    // Cloudflare's, which its D1 table runs on.
    providers: stdToolkitProviders().pipe(
      Layer.provideMerge(Cloudflare.providers()),
    ),
    // Local on disk for a personal stage; Cloudflare's for prod, demo and PRs.
    state: State,
  },
  // The site; the Machines Worker it is handed the URL of comes with it.
  Website,
);
