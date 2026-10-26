import { Stack } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Layer } from 'effect';
import { providers as stdToolkitProviders } from '@kestack/std-toolkit/alchemy';
import { State } from '@kestack/web-platform/app/alchemy';
import { Website } from './src/deploy/infra/index.ts';

export default Stack(
  'Code',
  {
    // Cloudflare's: the site is one Worker. std-toolkit's only so a stage
    // deployed before Cloud Connect moved out can destroy its old connections
    // table; drop it once every stage has deployed once.
    providers: stdToolkitProviders().pipe(
      Layer.provideMerge(Cloudflare.providers()),
    ),
    // Local on disk for a personal stage; Cloudflare's for prod, demo and PRs.
    state: State,
  },
  // The site; the Connections it lists come from Cloud Connect, in @kestack/connect.
  Website,
);
