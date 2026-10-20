/**
 * Declares a Middleware: something attached to an Rpc or an RpcGroup that
 * both sides agree on. `with(value)` attaches it (the nearest value wins),
 * `layer` is its server half and `client` its optional client half.
 *
 * Curried so the value type can be given while the rest is inferred:
 * `middleware<Role>()('app/Role', { provides: CurrentUser })`.
 */
export { make as middleware } from './middleware/index.ts';

/**
 * Runs an observer with the Exit of each call sent from within an effect,
 * before the caller sees it: how a Client Implementation reacts to an answer,
 * since its `next` only sends. `next(request).pipe(onExit(observer))`.
 */
export { onExit } from './on-exit/index.ts';

// Each Transport is its own subpath (`rpc/http`, `rpc/websocket`,
// `rpc/in-process`), so an app imports only the Transports it uses.

export type { ExitObserver } from './on-exit/index.ts';
export type {
  ClientImpl as MiddlewareClient,
  Middleware,
  ServerImpl as MiddlewareServer,
  ServerOptions as MiddlewareServerOptions,
} from './middleware/index.ts';
