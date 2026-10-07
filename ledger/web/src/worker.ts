import { Layer } from 'effect';
import { createServer } from '@kstackz/web-platform/server';
import { apis } from '@ledger/core/apis';
import { ledgerBackend } from '@ledger/core/backend';
import { tableCloud } from '@ledger/core/backend/services/table/cloud';
import type { WorkerEnv } from './infra/index.ts';
import { AUTH_URL, LEDGER_RESOURCE } from './stage.ts';

/** Ledger's APIs on the cloud Backend's services, the D1 database and the
 * sign-in service; everything else is the app. */
export default createServer({
  apis,
  backend: (env: WorkerEnv) => ({
    ledger: ledgerBackend.pipe(Layer.provide(tableCloud(env.DB))),
  }),
  auth: { url: AUTH_URL, resource: LEDGER_RESOURCE },
}) satisfies ExportedHandler<WorkerEnv>;
