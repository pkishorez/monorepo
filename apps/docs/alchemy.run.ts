import { Stack } from 'alchemy';
import { providers as awsProviders } from '@alchemy.run/aws';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { State } from '@kestack/web-platform/app/alchemy';
import * as Layer from 'effect/Layer';
import { Website } from './src/infra/index.ts';

export default Stack(
  'Docs',
  {
    providers: Layer.mergeAll(Cloudflare.providers(), awsProviders()),
    // Local on disk for a personal Stage; Cloudflare's for prod, demo and PRs.
    state: State,
  },
  Website,
);
