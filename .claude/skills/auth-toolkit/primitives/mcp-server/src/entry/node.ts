import { serve } from 'srvx';
import {
  hostsFor,
  requiredScopes,
  resourceServerConfigFor,
} from '../../infra/config.ts';
import { createResourceServer } from '../resource-server/index.ts';

// Any Node, Bun, or Deno host. Defaults to the local instance; set AUTH_URL
// and MCP_RESOURCE to run as another one. `pnpm dev:node` runs this behind
// Portless on the same local host as the Cloudflare entry.
const defaults = resourceServerConfigFor(
  hostsFor(process.env.STAGE ?? 'local'),
);

serve({
  port: process.env.PORT ?? 3000,
  fetch: createResourceServer({
    authWorkerUrl: process.env.AUTH_URL ?? defaults.authWorkerUrl,
    resource: process.env.MCP_RESOURCE ?? defaults.resource,
    requiredScopes,
  }),
});
