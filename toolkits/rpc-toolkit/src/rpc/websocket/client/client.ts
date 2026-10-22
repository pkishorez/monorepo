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

/*
 * Effect's WebSocket takes its protocols once, but its URL as an Effect run
 * on every connect. So protocols given as an Effect are read alongside the
 * URL and handed to the constructor that the same connect calls next.
 */
const socketLayer = (
  url: string | Effect.Effect<string>,
  protocols:
    | ReadonlyArray<string>
    | Effect.Effect<ReadonlyArray<string>>
    | undefined,
) => {
  const resolved =
    typeof url === 'string'
      ? Effect.succeed(resolveUrl(url))
      : Effect.map(url, resolveUrl);
  let offered: Array<string> | undefined =
    protocols === undefined || Effect.isEffect(protocols)
      ? undefined
      : [...protocols];
  const dial = Effect.isEffect(protocols)
    ? Effect.zipWith(resolved, protocols, (at, list) => {
        offered = [...list];
        return at;
      })
    : resolved;
  return Socket.layerWebSocket(dial).pipe(
    Layer.provide(
      Layer.succeed(Socket.WebSocketConstructor)(
        (at) => new globalThis.WebSocket(at, offered),
      ),
    ),
  );
};

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
    /** Subprotocols offered in `Sec-WebSocket-Protocol`, the one header a
     * browser lets a WebSocket set. An Effect is run before every connect,
     * as `url` is. */
    readonly protocols?:
      | ReadonlyArray<string>
      | Effect.Effect<ReadonlyArray<string>>
      | undefined;
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
            socketLayer(options.url, options.protocols),
            RpcSerialization.layerJson,
          ),
        ),
        Layer.provideMerge(rpcConnectionLayer),
        withExitObservers(group),
      ),
    ),
  );
