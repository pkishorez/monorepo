import { rpcPath } from '../../infra/config.ts';
import type { WorkerEnv } from '../../infra/api-worker.ts';
import { createRpcHost } from '../server/rpc-host/index.ts';

let host: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch(request, env) {
    host ??= createRpcHost({ authWorkerUrl: env.AUTH_URL, rpcPath });
    return host(request);
  },
} satisfies ExportedHandler<WorkerEnv>;
