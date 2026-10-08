import { Layer } from 'effect';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';
import { createServer, liveObject } from '@kstackz/web-platform/server';
import { apis } from '@ledger/core/apis';
import { ledgerBackend } from '@ledger/core/backend';
import { broadcasterDurableObject } from '@ledger/core/backend/services/broadcaster/durable-object';
import { tableCloud } from '@ledger/core/backend/services/table/cloud';
import { tableDurableObject } from '@ledger/core/backend/services/table/durable-object';
import type { WorkerEnv } from './infra/index.ts';
import { AUTH_URL, LEDGER_RESOURCE } from './stage.ts';

const auth = { url: AUTH_URL, resource: LEDGER_RESOURCE };

/**
 * One User's money in a Durable Object of their own, in the realtime Sync
 * Mode: the Ledger API over a WebSocket, its own SQLite, and every change
 * pushed to each of their devices as it is made. Open streams are kept in
 * that SQLite while it sleeps.
 */
export const LedgerObject = liveObject({
  api: apis.ledger,
  backend: (_env: WorkerEnv, storage) =>
    ledgerBackend.pipe(
      Layer.provide([tableDurableObject(storage), broadcasterDurableObject]),
    ),
  auth,
  streams: (state) => Rpc.websocket.streams.sqlite({ storage: state.storage }),
});

/** Ledger's APIs on the cloud Backend, each where its Sync Mode keeps it
 * (the D1 database, or each User's Durable Object), checked with the
 * sign-in service; everything else is the app. */
export default createServer({
  apis,
  backend: (env: WorkerEnv) => ({
    ledger: ledgerBackend.pipe(Layer.provide(tableCloud(env.DB))),
  }),
  live: (env: WorkerEnv) => ({ ledger: env.LedgerObject }),
  auth,
}) satisfies ExportedHandler<WorkerEnv>;
