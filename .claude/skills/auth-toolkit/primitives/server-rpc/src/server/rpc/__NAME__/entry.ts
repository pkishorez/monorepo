import {
  authzCookies,
  authzLayer,
  resolverLive,
} from 'auth-toolkit/rpc/server';
import { Effect, Layer } from 'effect';
import { HttpEffect } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { authUrlFor } from '../../../shared/auth/index.ts';
import { Greeting } from '../../../shared/rpc/greeting/index.ts';
import { GreetingHandlers } from '../../../shared/rpc/greeting-handlers/index.ts';

// Server-Side Verification against the Auth Worker for this app's host.
// Guards declared on the groups run here; unguarded RPCs are untouched.
const authzFor = (request: Request) =>
  authzLayer.pipe(
    Layer.provide(
      resolverLive({
        authWorkerUrl: authUrlFor(new URL(request.url).hostname),
      }),
    ),
  );

export function handle__Name__Rpc(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Promise.resolve(
      new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'POST' },
      }),
    );
  }

  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const rpc = yield* RpcServer.toHttpEffect(Greeting);
        // authzCookies verifies once per batched request and relays refreshed
        // session cookies; it needs the non-framing JSON serializer.
        return yield* Effect.promise(() =>
          HttpEffect.toWebHandler(authzCookies(rpc))(request),
        );
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            GreetingHandlers,
            authzFor(request),
            RpcSerialization.layerJson,
          ),
        ),
      ),
    ),
  );
}
