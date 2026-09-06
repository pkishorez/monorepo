import handler from '@tanstack/react-start/server-entry';
import type { WorkerEnv } from '../alchemy.run.ts';
import { handleRpc } from './server/entry.ts';

export default {
  fetch: (request, env) =>
    new URL(request.url).pathname === '/rpc'
      ? handleRpc(request, env.DB)
      : handler.fetch(request),
} satisfies ExportedHandler<WorkerEnv>;
