import { Stack } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Layer } from 'effect';
import { providers as stdToolkitProviders } from '@kestack/std-toolkit/alchemy';
import { State } from '@kestack/web-platform/app/alchemy';
import { Website } from './src/infra/index.ts';

export default Stack(
  'KabukiStart',
  {
    // std-toolkit's, for the Pocket table and its deploy guard, over
    // Cloudflare's, which its D1 table runs on.
    providers: stdToolkitProviders().pipe(
      Layer.provideMerge(Cloudflare.providers()),
    ),
    // Local on disk for a personal stage; Cloudflare's for prod, demo and PRs.
    state: State,
  },
  // The site; the API Workers it is handed the URLs of come with it.
  Website,
);
