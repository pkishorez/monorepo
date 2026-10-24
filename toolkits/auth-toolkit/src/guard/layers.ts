import type { Layer } from 'effect';
import type { HttpApiMiddleware } from 'effect/http-api';
import type { RpcMiddleware } from 'effect/rpc';

import type { httpMiddleware } from './http-api.js';
import type { rpcMiddleware } from './rpc.js';

type Instance<C> = C extends { new (_: never): infer I } ? I : never;
type RpcId = Instance<(typeof rpcMiddleware)['middleware']>;
type HttpId = Instance<(typeof httpMiddleware)['middleware']>;

/** The Guard's server half for Effect RPC: give it with the handlers. */
export type RpcGuard = Layer.Layer<RpcId>;

/** The Guard's server half for Effect HttpApi: give it with the handlers.
 * `R` is the HttpRouter a Resource Server serves its metadata on. */
export type HttpGuard<R = never> = Layer.Layer<HttpId, never, R>;

/** The Guard's client half: signs every guarded RPC and HttpApi call. */
export type Signing =
  | RpcMiddleware.ForClient<RpcId>
  | HttpApiMiddleware.ForClient<HttpId>;
