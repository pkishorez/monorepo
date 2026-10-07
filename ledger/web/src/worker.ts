import { LedgerApi } from '@ledger/core/api';
import { ledgerBackend } from '@ledger/core/backend';
import { authCloud } from '@ledger/core/backend/services/auth/cloud';
import { tableCloud } from '@ledger/core/backend/services/table/cloud';
import { Layer } from 'effect';
import { serveRpc, webServer } from '@kstackz/web-toolkit/server';
import type { WorkerEnv } from './infra/index.ts';
import { AUTH_URL, LEDGER_RESOURCE } from './stage.ts';

/** `/rpc` is the Ledger API, on the cloud Backend's services: the D1
 * database and the sign-in service; everything else is the app. */
export default webServer<WorkerEnv>({
  rpc: (request, env) =>
    serveRpc(
      request,
      LedgerApi,
      ledgerBackend.pipe(
        Layer.provide([
          tableCloud(env.DB),
          authCloud({ authUrl: AUTH_URL, resource: LEDGER_RESOURCE }),
        ]),
      ),
    ),
}) satisfies ExportedHandler<WorkerEnv>;
