import { Effect, Layer } from 'effect';
import { makeStageDeletionLock } from '../../storage/stage-deletion-lock/index.ts';
import {
  authzCookies,
  authzLayer,
  resolverLive,
} from 'auth-toolkit/rpc/server';
import { ConsoleApi } from '../../../shared/api/console-api/index.ts';
import { ConsoleHandlers } from '../../handlers/console-handlers/index.ts';
import { FetchHttpClient } from 'effect/unstable/http';
import { HttpEffect } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeD1SQLite } from 'std-toolkit/db/sqlite/d1';
import { appTable } from '../../storage/state-store-database/index.ts';
import { telemetryLayer } from '../../telemetry/index.ts';

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

  const database = makeD1SQLite({ database: binding });
  const table = SQLite.make(appTable, { database });
  const deletionLock = makeStageDeletionLock(database);

  const http = FetchHttpClient.layer.pipe(
    Layer.provide(
      // workerd supports manual/follow; inspect redirects before sending credentials elsewhere.
      Layer.succeed(FetchHttpClient.RequestInit, { redirect: 'manual' }),
    ),
  );

  const dependencies = Layer.mergeAll(
    ConsoleHandlers.pipe(
      Layer.provide(table.layer),
      Layer.provide(http),
      Layer.provide(deletionLock.layer),
    ),
    authzLayer.pipe(
      Layer.provide(
        resolverLive({
          authWorkerUrl: import.meta.env.DEV
            ? 'https://auth.kishore.computer'
            : 'https://auth.kishore.app',
        }),
      ),
    ),
    RpcSerialization.layerNdjson,
    table.layer,
  );

  let dispose!: () => Promise<void>;
  const app = Effect.gen(function* () {
    // Keep providers in the HTTP request scope, which transfers to a streaming body.
    const scope = yield* Effect.scope;
    yield* Effect.addFinalizer(() =>
      Effect.yieldNow.pipe(Effect.andThen(Effect.promise(() => dispose()))),
    );
    const context = yield* Layer.buildWithScope(
      Layer.fresh(dependencies),
      scope,
    );
    return yield* Effect.gen(function* () {
      yield* table.setup;
      yield* deletionLock.setup;
      const rpc = yield* RpcServer.toHttpEffect(ConsoleApi);
      return yield* authzCookies(rpc).pipe(Effect.interruptible);
    }).pipe(Effect.provide(context));
  });
  const web = HttpEffect.toWebHandlerLayer(app, telemetryLayer());
  dispose = web.dispose;
  return web.handler(request).catch(async (error) => {
    await web.dispose();
    throw error;
  });
}
