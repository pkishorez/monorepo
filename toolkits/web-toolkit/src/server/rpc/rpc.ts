import { Effect, Layer } from 'effect';
import { HttpEffect, type HttpServerResponse } from 'effect/http';
import {
  type Rpc,
  type RpcGroup,
  RpcSerialization,
  RpcServer,
} from 'effect/rpc';
import { authzCookies } from '@kstackz/auth-toolkit/server/rpc';

/** What one request's handlers need: the API's handlers and middleware,
 * with everything they stand on, built for that request alone. */
export type RpcServices<Rpcs extends Rpc.Any> = Layer.Layer<
  Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.ServicesServer<Rpcs>,
  unknown
>;

/**
 * Answers one `/rpc` request with `api` over NDJSON, the way the client's
 * HTTP connection calls it: a POST, its caller resolved by auth-toolkit
 * from a bearer token or the sign-in cookie. `services` is built fresh for
 * the request and lives as long as its response, which a streamed body
 * outlives; so whatever a request opens (a database binding, say) ends with
 * it. Runs on any platform that speaks `Request` and `Response`.
 */
export function serveRpc<Rpcs extends Rpc.Any>(
  request: Request,
  api: RpcGroup.RpcGroup<Rpcs>,
  services: RpcServices<Rpcs>,
): Promise<Response> {
  if (request.method !== 'POST') {
    return Promise.resolve(
      new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'POST' },
      }),
    );
  }

  const dependencies = Layer.mergeAll(services, RpcSerialization.layerNdjson);

  let dispose!: () => Promise<void>;
  const app = Effect.gen(function* () {
    const scope = yield* Effect.scope;
    yield* Effect.addFinalizer(() =>
      Effect.yieldNow.pipe(Effect.andThen(Effect.promise(() => dispose()))),
    );
    const context = yield* Layer.buildWithScope(
      Layer.fresh(dependencies),
      scope,
    ).pipe(Effect.orDie);
    const served = Effect.gen(function* () {
      const rpc = yield* RpcServer.toHttpEffect(api);
      return yield* authzCookies(rpc).pipe(Effect.interruptible);
    }).pipe(Effect.provide(context));
    // `context` holds every service `api` needs; TypeScript can't see it
    // through the generic `Rpcs`.
    return yield* served as Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      never,
      never
    >;
  });
  const web = HttpEffect.toWebHandlerLayer(app, Layer.empty);
  dispose = web.dispose;
  return web.handler(request).catch(async (error) => {
    await web.dispose();
    throw error;
  });
}
