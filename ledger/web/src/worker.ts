import { LedgerApi } from '@ledger/core/api';
import { ledgerBackend } from '@ledger/core/backend';
import { tableCloud } from '@ledger/core/backend/services/table/cloud';
import { Layer } from 'effect';
import { authz } from '@kstackz/auth-toolkit/server/cloud';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';
import { webServer } from '@kstackz/web-toolkit/server';
import type { WorkerEnv } from './infra/index.ts';
import { AUTH_URL, LEDGER_RESOURCE } from './stage.ts';

/** `/rpc` is the Ledger API, on the cloud Backend's services: the D1
 * database and the sign-in service; everything else is the app. */
export default webServer<WorkerEnv>({
  rpc: (request, env) =>
    Rpc.http.server(
      LedgerApi,
      ledgerBackend.pipe(
        Layer.provide([
          tableCloud(env.DB),
          authz.cloud({ authWorkerUrl: AUTH_URL, resource: LEDGER_RESOURCE }),
        ]),
      ),
      // The sign-in cookies refreshed while checking go back on the answer.
      { wrap: authz.cookies },
    )(request),
}) satisfies ExportedHandler<WorkerEnv>;
