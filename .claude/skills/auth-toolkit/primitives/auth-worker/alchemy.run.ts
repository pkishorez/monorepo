import { Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { AuthWorker } from './infra/auth-worker.ts';

export type { WorkerEnv } from './infra/auth-worker.ts';

export default Stack(
  '__STACK_NAME__',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  AuthWorker,
);
