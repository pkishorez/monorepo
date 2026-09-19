import { Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { ApiWorker } from './infra/api-worker.ts';

export type { WorkerEnv } from './infra/api-worker.ts';

export default Stack(
  '__STACK_NAME__',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  ApiWorker,
);
