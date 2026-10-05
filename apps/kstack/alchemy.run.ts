import { Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Layer } from 'effect';
import { providers as stdToolkitProviders } from '@kstackz/std-toolkit/alchemy';
import { Website } from './src/infra/index.ts';

export default Stack(
  'Kstack',
  {
    providers: Layer.merge(Cloudflare.providers(), stdToolkitProviders()),
    state: Cloudflare.state(),
  },
  Website,
);
