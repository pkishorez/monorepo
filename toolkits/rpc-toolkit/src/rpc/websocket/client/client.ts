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

/** How a socket closed, as the browser reads it: its close code and reason. */
export interface SocketClose {
  readonly code: number;
  readonly reason: string;
}

/**
 * What `client` tells of each socket it opens, as it happens: the first
 * frame the server sends on it, and how it closed. A browser cannot read
 * why a server refused a socket, only how the socket closed, so a server
 * that refuses one accepts it and closes it at once with a code of its own.
 */
export interface SocketWatch {
  /** The server sent the socket its first frame: it was not refused. */
  readonly answered?: (() => void) | undefined;
  /** The socket closed, with its code and reason. */
  readonly closed?: ((close: SocketClose) => void) | undefined;
}

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

/** A socket at `at`, offering `protocols`, told to `watch` as it answers and closes. */
const open = (
  at: string,
  protocols: Array<string> | undefined,
  watch: SocketWatch | undefined,
) => {
  const socket = new globalThis.WebSocket(at, protocols);
  const { answered, closed } = watch ?? {};
  if (answered !== undefined)
    socket.addEventListener('message', () => answered(), { once: true });
  if (closed !== undefined)
    socket.addEventListener(
      'close',
      (event) => closed({ code: event.code, reason: event.reason }),
      { once: true },
    );
  return socket;
};

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
  watch: SocketWatch | undefined,
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
      Layer.succeed(Socket.WebSocketConstructor)((at) =>
        open(at, offered, watch),
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
    /** Told of each socket's first frame in, and how it closed. */
    readonly watch?: SocketWatch | undefined;
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
            socketLayer(options.url, options.protocols, options.watch),
            RpcSerialization.layerJson,
          ),
        ),
        Layer.provideMerge(rpcConnectionLayer),
        withExitObservers(group),
      ),
    ),
  );
