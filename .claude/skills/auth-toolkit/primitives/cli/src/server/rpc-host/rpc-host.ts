import {
  authzCookies,
  authzLayer,
  resolverLive,
} from 'auth-toolkit/rpc/server';
import { Effect, Layer } from 'effect';
import { HttpEffect } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { Greeting } from '../../shared/rpc/greeting/index.ts';
import { GreetingHandlers } from '../handlers/index.ts';

export interface RpcHostConfig {
  authWorkerUrl: string;
  rpcPath: string;
  authz?: Layer.Layer<Layer.Success<typeof authzLayer>> | undefined;
}

const landing = (config: RpcHostConfig) =>
  new Response(
    [
      'CLI API',
      `RPC: POST ${config.rpcPath}`,
      `Auth Worker: ${config.authWorkerUrl}`,
    ].join('\n'),
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );

export const createRpcHost = (
  config: RpcHostConfig,
): ((request: Request) => Promise<Response>) => {
  const authz =
    config.authz ??
    authzLayer.pipe(
      Layer.provide(resolverLive({ authWorkerUrl: config.authWorkerUrl })),
    );

  const serve = (request: Request) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const rpc = yield* RpcServer.toHttpEffect(Greeting);
          return yield* Effect.promise(() =>
            HttpEffect.toWebHandler(authzCookies(rpc))(request),
          );
        }).pipe(
          Effect.provide(
            Layer.mergeAll(GreetingHandlers, authz, RpcSerialization.layerJson),
          ),
        ),
      ),
    );

  return (request) => {
    // Effect's RPC client posts to the URL with a trailing slash.
    const pathname = new URL(request.url).pathname.replace(/\/$/, '');
    if (pathname === '') return Promise.resolve(landing(config));
    if (pathname !== config.rpcPath) {
      return Promise.resolve(new Response('Not found', { status: 404 }));
    }
    if (request.method !== 'POST') {
      return Promise.resolve(
        new Response('Method not allowed', {
          status: 405,
          headers: { Allow: 'POST' },
        }),
      );
    }
    return serve(request);
  };
};
