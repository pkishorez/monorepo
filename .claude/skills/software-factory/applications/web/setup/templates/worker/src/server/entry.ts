import { Effect, Layer } from 'effect';
import { HttpEffect } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { Greeting } from '../shared/rpc/greeting/index.ts';
import { GreetingHandlers } from '../shared/rpc/greeting-handlers/index.ts';

export function handleRpc(request: Request): Promise<Response> {
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
        return yield* Effect.promise(() =>
          HttpEffect.toWebHandler(rpc)(request),
        );
      }).pipe(
        Effect.provide(
          Layer.mergeAll(GreetingHandlers, RpcSerialization.layerJson),
        ),
      ),
    ),
  );
}
