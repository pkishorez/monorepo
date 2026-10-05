import { Effect, Layer } from 'effect';
import { FetchHttpClient, HttpEffect } from 'effect/http';
import { RpcSerialization, RpcServer } from 'effect/rpc';
import {
  authzCookies,
  authzLayer,
  resolverLive,
} from '@kstackz/auth-toolkit/server/rpc';
import { SQLite } from '@kstackz/std-toolkit/db/sqlite';
import { makeD1SQLite } from '@kstackz/std-toolkit/db/sqlite/d1';
import { LedgerApi } from '../../domain/ledger-api/index.ts';
import { LedgerHandlers } from '../ledger/index.ts';
import { ledgerTable } from '../storage/index.ts';

/** The Auth Worker that signs users in, for this stage. */
export const AUTH_URL = import.meta.env.DEV
  ? 'https://auth.kishore.computer'
  : 'https://auth.kishore.app';

/**
 * Answers one `/rpc` request: the Ledger API over NDJSON, for the user its
 * session cookie names, against the D1 database.
 */
export function handleRpc(
  request: Request,
  binding: D1Database,
): Promise<Response> {
  if (request.method !== 'POST') {
    return Promise.resolve(
      new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'POST' },
      }),
    );
  }

  const table = SQLite.make(ledgerTable, {
    database: makeD1SQLite({ database: binding }),
  });
  const http = FetchHttpClient.layer.pipe(
    // Redirects are looked at before any credentials go elsewhere.
    Layer.provide(
      Layer.succeed(FetchHttpClient.RequestInit, { redirect: 'manual' }),
    ),
  );
  const dependencies = Layer.mergeAll(
    LedgerHandlers.pipe(Layer.provide(table.layer)),
    authzLayer.pipe(
      Layer.provide(resolverLive({ authWorkerUrl: AUTH_URL })),
      Layer.provide(http),
    ),
    RpcSerialization.layerNdjson,
    table.layer,
  );

  let dispose!: () => Promise<void>;
  const app = Effect.gen(function* () {
    // The providers live as long as the request, which a streamed body outlives.
    const scope = yield* Effect.scope;
    yield* Effect.addFinalizer(() =>
      Effect.yieldNow.pipe(Effect.andThen(Effect.promise(() => dispose()))),
    );
    const context = yield* Layer.buildWithScope(
      Layer.fresh(dependencies),
      scope,
    );
    return yield* Effect.gen(function* () {
      const rpc = yield* RpcServer.toHttpEffect(LedgerApi);
      return yield* authzCookies(rpc).pipe(Effect.interruptible);
    }).pipe(Effect.provide(context));
  });
  const web = HttpEffect.toWebHandlerLayer(app, Layer.empty);
  dispose = web.dispose;
  return web.handler(request).catch(async (error) => {
    await web.dispose();
    throw error;
  });
}
