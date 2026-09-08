import { Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Website } from './infra/website.ts';

export type { WorkerEnv } from './infra/website.ts';

export default Stack(
  '__STACK_NAME__',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Website,
);
