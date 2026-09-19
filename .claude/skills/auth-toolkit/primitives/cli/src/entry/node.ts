import { serve } from 'srvx';
import { hostsFor, instanceConfigFor, rpcPath } from '../../infra/config.ts';
import { createRpcHost } from '../server/rpc-host/index.ts';

const defaults = instanceConfigFor(hostsFor(process.env.STAGE ?? 'local'));

serve({
  port: process.env.PORT ?? 3000,
  fetch: createRpcHost({
    authWorkerUrl: process.env.AUTH_URL ?? defaults.authWorkerUrl,
    rpcPath,
  }),
});
