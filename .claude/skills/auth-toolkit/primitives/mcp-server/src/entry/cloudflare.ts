import { requiredScopes } from '../../infra/config.ts';
import type { WorkerEnv } from '../../infra/mcp-worker.ts';
import { createResourceServer } from '../resource-server/index.ts';

// Bindings are fixed for an isolate's life, so the server is built once.
let server: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch(request, env) {
    server ??= createResourceServer({
      authWorkerUrl: env.AUTH_URL,
      resource: env.MCP_RESOURCE,
      requiredScopes,
    });
    return server(request);
  },
} satisfies ExportedHandler<WorkerEnv>;
