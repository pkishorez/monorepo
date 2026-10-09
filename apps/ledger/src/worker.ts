import { Layer } from 'effect';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';
import { createServer, liveObject } from '@kstackz/web-platform/server';
import { apis } from './apis.ts';
import { ledgerBackend } from './backend/backend.ts';
import { broadcasterDurableObject } from './backend/services/broadcaster/durable-object.ts';
import { tableCloud } from './backend/services/table/cloud.ts';
import { tableDurableObject } from './backend/services/table/durable-object.ts';
import type { WorkerEnv } from './infra/index.ts';
import { AUTH_URL } from './stage.ts';

const auth = { url: AUTH_URL };

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
