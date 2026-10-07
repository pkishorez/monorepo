import { make } from './middleware/index.ts';

/**
 * Declares a Middleware for Effect HttpApi: the same shape as
 * `Rpc.middleware` over `HttpApiEndpoint` and `HttpApiGroup`, plus a
 * `security` option that feeds OpenAPI and hands the credential to the
 * server half.
 *
 * Curried so the value type can be given while the rest is inferred:
 * `HttpApi.middleware<Role>()('app/Role', { provides: CurrentUser })`.
 */
export const middleware = make;

export type {
  ClientImpl as MiddlewareClient,
  Middleware,
  ServerImpl as MiddlewareServer,
  ServerOptions as MiddlewareServerOptions,
} from './middleware/index.ts';
