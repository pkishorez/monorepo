/**
 * Declares a Middleware: something attached to an Rpc or an RpcGroup that
 * both sides agree on. `with(value)` attaches it (the nearest value wins),
 * `layer` is its server half and `client` its optional client half.
 *
 * Curried so the value type can be given while the rest is inferred:
 * `Rpc.middleware<Role>()('app/Role', { provides: CurrentUser })`.
 */
export { make as middleware } from './middleware/index.ts';

// Each Transport is a module namespace, not an object, so a bundler keeps
// only the halves an app calls: `Rpc.http.client` leaves `Rpc.http.server`
// and the other Transports out.

/** The http Transport: POST, NDJSON, batched, one client and server pair. */
export * as http from './http/index.ts';

/**
 * The websocket Transport: a hibernating Durable Object server and a client
 * that keeps subscriptions alive across reconnects, both speaking JSON.
 */
export * as websocket from './websocket/index.ts';

/** The inProcess Transport: the group's handlers in this process, no wire. */
export * as inProcess from './in-process/index.ts';

export type {
  ClientImpl as MiddlewareClient,
  Middleware,
  ServerImpl as MiddlewareServer,
  ServerOptions as MiddlewareServerOptions,
} from './middleware/index.ts';
export type {
  ConnectionSlot,
  ConnectionStatus,
  HibernatingSocket,
  SavedSocket,
  SavedStream,
  StreamRequest,
  StreamStore,
} from './websocket/index.ts';
