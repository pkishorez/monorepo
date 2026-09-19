import { Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { McpWorker } from './infra/mcp-worker.ts';

export type { WorkerEnv } from './infra/mcp-worker.ts';

export default Stack(
  '__STACK_NAME__',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  McpWorker,
);
