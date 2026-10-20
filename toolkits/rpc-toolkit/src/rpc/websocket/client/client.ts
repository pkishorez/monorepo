import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import {
  RpcClient,
  RpcSerialization,
  type Rpc,
  type RpcGroup,
} from 'effect/rpc';
import * as Socket from 'effect/socket/Socket';
import { makeRpcConnection, type RpcConnectionService } from './connection.ts';
import { withExitObservers } from '../../on-exit/index.ts';
import { resolveUrl } from './url.ts';

export type { ConnectionStatus } from './connection.ts';

// Retain the established service identity across the package migration.
export class RpcConnection
  extends /*#__PURE__*/ Context.Service<RpcConnection, RpcConnectionService>()(
    '@pkishorez/effect-cloudflare/RpcConnection',
  ) {}

const connectionLayer = /*#__PURE__*/ Layer.effect(
  RpcConnection,
  makeRpcConnection,
);

/** Bundled into `client`. */
const rpcConnectionLayer = /*#__PURE__*/ Layer.effect(
  RpcClient.ConnectionHooks,
  /*#__PURE__*/ Effect.map(RpcConnection, ({ hooks }) => hooks),
).pipe(Layer.provideMerge(connectionLayer));

/** Stream of `connecting`, `connected` or `reconnecting`, primed with the current value. */
export const status = /*#__PURE__*/ Stream.unwrap(
  /*#__PURE__*/ Effect.map(
    RpcConnection,
    ({ connectionStatus }) => connectionStatus,
  ),
);

/** Runs `subscribe()` while connected and re-runs it after every reconnect. */
export const keepSubscribed = <A, E, R>(
  subscribe: () => Stream.Stream<A, E, R>,
): Stream.Stream<A, E, R | RpcConnection> =>
  Stream.unwrap(
    Effect.map(RpcConnection, ({ keepSubscribed }) =>
      keepSubscribed(subscribe),
    ),
  );

/**
 * The `RpcClient.Protocol` for `group` over a WebSocket, with JSON
 * serialization (the protocol the websocket server speaks) and connection
 * tracking wired in.
 *
 * Outputs `RpcClient.Protocol`, `RpcConnection` and `RpcClient.ConnectionHooks`
 * together, so compose it with `Layer.provideMerge` — plain `Layer.provide`
 * would satisfy the client but hide `RpcConnection` from your own code.
 *
 * The URL is relative (resolved against `location`, `http(s)` swapped for
 * `ws(s)`) or absolute, and is resolved lazily at layer build time, which
 * keeps a module-level `ManagedRuntime` safe to construct during SSR. Given
 * as an Effect, it is run before every connect instead.
 */
export const client = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options: {
    /** Where to connect. An Effect is run again before every connect, so a
     * reconnect can carry what has changed since, such as a fresh token. */
    readonly url: string | Effect.Effect<string>;
    /** Default `true` — ride out drops instead of failing the client. */
    readonly retryTransientErrors?: boolean | undefined;
  },
): Layer.Layer<
  RpcClient.Protocol | RpcConnection | RpcClient.ConnectionHooks
> =>
  Layer.unwrap(
    Effect.sync(() =>
      RpcClient.layerProtocolSocket({
        retryTransientErrors: options.retryTransientErrors ?? true,
      }).pipe(
        Layer.provide(
          Layer.mergeAll(
            Socket.layerWebSocket(
              typeof options.url === 'string'
                ? resolveUrl(options.url)
                : Effect.map(options.url, resolveUrl),
            ).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal)),
            RpcSerialization.layerJson,
          ),
        ),
        Layer.provideMerge(rpcConnectionLayer),
        withExitObservers(group),
      ),
    ),
  );
