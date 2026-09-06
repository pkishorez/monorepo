import { Effect, Layer } from 'effect';
import {
  authzCookies,
  authzLayer,
  resolverLive,
} from 'auth-toolkit/rpc/server';
import { StoreDetails } from '../../../shared/rpc/store-details/index.ts';
import { StoreDetailsHandlers } from '../../handlers/store-details-handlers/index.ts';
import { FetchHttpClient } from 'effect/unstable/http';
import { HttpEffect } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeD1SQLite } from 'std-toolkit/db/sqlite/d1';
import { appTable } from '../../storage/state-store-database/index.ts';
import { StateStores } from '../../../shared/rpc/state-stores/index.ts';
import { StateStoreHandlers } from '../../handlers/state-store-handlers/index.ts';
import { Greeting } from '../../../shared/rpc/greeting/index.ts';
import { GreetingHandlers } from '../../handlers/greeting-handlers/index.ts';
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

  const table = SQLite.make(appTable, {
    database: makeD1SQLite({ database: binding }),
  });

  const http = FetchHttpClient.layer.pipe(
    Layer.provide(
      // workerd supports manual/follow; inspect redirects before sending credentials elsewhere.
      Layer.succeed(FetchHttpClient.RequestInit, { redirect: 'manual' }),
    ),
  );

  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* table.setup;

        const rpc = yield* RpcServer.toHttpEffect(
          Greeting.merge(StateStores, StoreDetails),
        );
        const context = yield* Effect.context();
        const response = yield* Effect.promise(() =>
          // The web handler masks interruption while writing its response.
          // Restore it for RPC work so a disconnected client cancels handlers.
          HttpEffect.toWebHandler(authzCookies(rpc).pipe(Effect.interruptible))(
            request,
            context,
          ),
        );
        // HTTP spans finish on the dispatcher; let them end before telemetry drains.
        yield* Effect.yieldNow;
        return response;
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            GreetingHandlers,
            StoreDetailsHandlers.pipe(
              Layer.provide(table.layer),
              Layer.provide(http),
            ),
            StateStoreHandlers.pipe(
              Layer.provide(table.layer),
              Layer.provide(http),
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
            RpcSerialization.layerJson,
            table.layer,
          ),
        ),
        Effect.provide(telemetryLayer()),
      ),
    ),
  );
}
