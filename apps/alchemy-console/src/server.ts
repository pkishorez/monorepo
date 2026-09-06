import handler from '@tanstack/react-start/server-entry';
import type { WorkerEnv } from '../alchemy.run.ts';
import { handleRpc } from './server/host/rpc-host/index.ts';

export default {
  fetch: (request, env) => {
    const path = new URL(request.url).pathname;
    return path === '/rpc' || path === '/rpc/'
      ? handleRpc(request, env.DB)
      : handler.fetch(request);
  },
} satisfies ExportedHandler<WorkerEnv>;
