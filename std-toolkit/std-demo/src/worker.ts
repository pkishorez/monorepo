import { RpcSerialization, RpcServer } from '@effect/rpc';
import type { bunsite } from '../alchemy.run';
import { TodosRpcLive } from './backend/api';
import { Layer } from 'effect';
import { HttpMiddleware, HttpServer } from '@effect/platform';
import { TodosRpc } from './backend/domain';

// Infer all the env bindings from the bunsite object
type BunsiteEnv = typeof bunsite.Env;

export default {
  async fetch(request: Request, env: BunsiteEnv) {
    console.log('SOME_VALUE from type safe bindings', env.SOME_VALUE);

    const { handler } = RpcServer.toWebHandler(TodosRpc, {
      layer: Layer.mergeAll(
        TodosRpcLive,
        RpcSerialization.layerNdjson,
        HttpServer.layerContext,
      ),
      middleware(httpApp) {
        const origin = request.headers.get('Origin') || '';
        console.log('ORIGIN: ', origin);
        return httpApp.pipe(
          HttpMiddleware.cors({
            allowedOrigins: ['http://localhost:3000'],
            allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['*'],
          }),
        );
      },
    });

    return handler(request);
  },
};

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') || '';
  // Allow any localhost origin
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }
  return {};
}
