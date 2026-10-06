import handler from '@tanstack/react-start/server-entry';
import type { WorkerEnv } from '../infra/index.ts';
import { handleRpc } from '../../server/backends/remote/index.ts';

/** `/rpc` is the Ledger API; everything else is the app. */
export default {
  fetch: (request, env) => {
    const path = new URL(request.url).pathname;
    return path === '/rpc' || path === '/rpc/'
      ? handleRpc(request, env.DB)
      : handler.fetch(request);
  },
} satisfies ExportedHandler<WorkerEnv>;
