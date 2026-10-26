import { Stack } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Layer } from 'effect';
import { providers as stdToolkitProviders } from '@kestack/std-toolkit/alchemy';
import { State } from '@kestack/web-platform/app/alchemy';
import { CloudConnect } from './infra/index.ts';

export default Stack(
  'Connect',
  {
    // std-toolkit's, for the connections table and its deploy guard, over
    // Cloudflare's, which its D1 table runs on.
    providers: stdToolkitProviders().pipe(
      Layer.provideMerge(Cloudflare.providers()),
    ),
    // Local on disk for a personal stage; Cloudflare's for prod, demo and PRs.
    state: State,
  },
  // Cloud Connect: the Worker and its D1 database.
  CloudConnect,
);
