import { Effect, Layer } from 'effect';
import {
  authzCookies,
  authzLayer,
  resolverLive,
} from 'auth-toolkit/rpc/server';
import { HttpEffect } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeD1SQLite } from 'std-toolkit/db/sqlite/d1';
import { appTable } from '../shared/contracts/app-table/index.ts';
import { StateStores } from './rpc/state-stores/index.ts';
import { StateStoreHandlers } from './rpc/state-store-handlers/index.ts';
import { Greeting } from '../shared/rpc/greeting/index.ts';
import { GreetingHandlers } from '../shared/rpc/greeting-handlers/index.ts';

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

  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* table.setup;

        const rpc = yield* RpcServer.toHttpEffect(Greeting.merge(StateStores));
        return yield* Effect.promise(() =>
          HttpEffect.toWebHandler(authzCookies(rpc))(request),
        );
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            GreetingHandlers,
            StateStoreHandlers.pipe(Layer.provide(table.layer)),
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
      ),
    ),
  );
}
