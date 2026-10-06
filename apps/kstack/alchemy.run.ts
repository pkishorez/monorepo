import { AlchemyContext, localState, Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer } from 'effect';
import { providers as stdToolkitProviders } from '@kstackz/std-toolkit/alchemy';
import { Website } from './src/entry/infra/index.ts';

export default Stack(
  'Kstack',
  {
    providers: Layer.merge(Cloudflare.providers(), stdToolkitProviders()),
    // `alchemy dev` keeps its state in .alchemy on this machine, so it needs
    // no Cloudflare account; deploys keep theirs in Cloudflare.
    state: Layer.unwrap(
      AlchemyContext.use(({ dev }) =>
        Effect.succeed(dev ? localState() : Cloudflare.state()),
      ),
    ),
  },
  Website,
);
