import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import { RpcClient } from 'effect/unstable/rpc';
import type * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization';
import * as Socket from 'effect/unstable/socket/Socket';

/**
 * `connecting` — never reached the server yet.
 * `connected` — a live transport.
 * `reconnecting` — was connected at least once, currently is not.
 *
 * There is no terminal state: `ConnectionHooks` has no "gave up" signal.
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

/**
 * `generation` counts successful connects. It is what separates a first
 * connect from a reconnect, and it is what makes {@link keepSubscribed}
 * restart exactly once per reconnect rather than on every hook fire.
 */
type InternalConnectionStatus =
  | { readonly _tag: 'Connecting'; readonly generation: 0 }
  | { readonly _tag: 'Connected'; readonly generation: number }
  | { readonly _tag: 'Reconnecting'; readonly generation: number };

class SubscriptionEnded extends Data.TaggedError('SubscriptionEnded') {}

/** Internal — the shape of {@link RpcConnection}. Not part of the public surface. */
interface RpcConnectionService {
  readonly connectionStatus: Stream.Stream<ConnectionStatus>;
  /**
   * Runs `subscribe()` while connected and re-runs it after every reconnect.
   *
   * The returned stream carries no `RpcConnection` requirement, so it is the
   * form to use when the stream escapes the runtime that built it. Inside a
   * runtime, the free {@link keepSubscribed} reads better.
   */
  readonly keepSubscribed: <A, E, R>(
    subscribe: () => Stream.Stream<A, E, R>,
  ) => Stream.Stream<A, E, R>;
  /** Hand to `RpcClient.ConnectionHooks` so the transport can drive this service. */
  readonly hooks: RpcClient.ConnectionHooks['Service'];
}

// Retain the established service identity across the package migration.
export class RpcConnection extends Context.Service<
  RpcConnection,
  RpcConnectionService
>()('@pkishorez/effect-cloudflare/RpcConnection') {}

/** Internal — exported for tests. */
export const makeRpcConnection = Effect.gen(function* () {
  const state = yield* SubscriptionRef.make<InternalConnectionStatus>({
    _tag: 'Connecting',
    generation: 0,
  });

  const changes = SubscriptionRef.changes(state);
  const connectionStatus = changes.pipe(
    Stream.map((status): ConnectionStatus => {
      switch (status._tag) {
        case 'Connecting':
          return 'connecting';
        case 'Connected':
          return 'connected';
        case 'Reconnecting':
          return 'reconnecting';
      }
    }),
    Stream.changes,
  );

  const keepSubscribed: RpcConnectionService['keepSubscribed'] = (subscribe) =>
    changes.pipe(
      Stream.switchMap((status) =>
        status._tag === 'Connected'
          ? subscribe().pipe(
              Stream.concat(Stream.fail(new SubscriptionEnded())),
            )
          : Stream.never,
      ),
      // A subscription that ends on its own is done — the sentinel stops
      // `switchMap` from treating completion as something to resume.
      Stream.catchTag('SubscriptionEnded', () => Stream.empty),
    );

  const hooks: RpcConnectionService['hooks'] = {
    onConnect: SubscriptionRef.update(
      state,
      (status): InternalConnectionStatus => ({
        _tag: 'Connected',
        generation: status.generation + 1,
      }),
    ),
    onDisconnect: SubscriptionRef.update(
      state,
      (status): InternalConnectionStatus =>
        status._tag === 'Connecting'
          ? status
          : { _tag: 'Reconnecting', generation: status.generation },
    ),
  };

  return {
    connectionStatus,
    keepSubscribed,
    hooks,
  } satisfies RpcConnectionService;
});

const connectionLayer = Layer.effect(RpcConnection, makeRpcConnection);

/** Internal — bundled into `layerWebSocketProtocol`. */
export const rpcConnectionLayer = Layer.effect(
  RpcClient.ConnectionHooks,
  Effect.map(RpcConnection, ({ hooks }) => hooks),
).pipe(Layer.provideMerge(connectionLayer));

export const connectionStatus = Stream.unwrap(
  Effect.map(RpcConnection, ({ connectionStatus }) => connectionStatus),
);

export const keepSubscribed = <A, E, R>(
  subscribe: () => Stream.Stream<A, E, R>,
): Stream.Stream<A, E, R | RpcConnection> =>
  Stream.unwrap(
    Effect.map(RpcConnection, ({ keepSubscribed }) =>
      keepSubscribed(subscribe),
    ),
  );

/**
 * Resolves an RPC endpoint to an absolute `ws:`/`wss:` URL.
 *
 * A relative URL is resolved against `globalThis.location` and its scheme
 * swapped (`https:` → `wss:`, otherwise `ws:`); the query is kept and the hash dropped.
 * An absolute URL is used as given, with the same scheme swap applied.
 *
 * Exported so callers who need their own `Socket` layer — a test double, a
 * non-global `WebSocket` constructor — do not have to restate this.
 *
 * @throws if given a relative URL where there is no `location` (SSR, Workers).
 */
export const resolveWebSocketUrl = (url: string): string => {
  const base = globalThis.location?.href;
  if (base === undefined && !/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    throw new Error(
      `Cannot resolve the relative RPC url ${JSON.stringify(url)}: there is ` +
        'no globalThis.location here. Pass an absolute ws:// or wss:// url.',
    );
  }

  const resolved = new URL(url, base);
  if (resolved.protocol !== 'ws:' && resolved.protocol !== 'wss:') {
    resolved.protocol = resolved.protocol === 'https:' ? 'wss:' : 'ws:';
  }
  resolved.hash = '';
  return resolved.toString();
};

/**
 * An `RpcClient` protocol over a WebSocket, with connection tracking wired in.
 *
 * Outputs `RpcClient.Protocol`, `RpcConnection` and `RpcClient.ConnectionHooks`
 * together, so compose it with `Layer.provideMerge` — plain `Layer.provide`
 * would satisfy the client but hide `RpcConnection` from your own code.
 *
 * The URL is resolved lazily at layer build time, which keeps a module-level
 * `ManagedRuntime` safe to construct during SSR.
 */
export const layerWebSocketProtocol = (options: {
  /** Relative (resolved against `location`) or absolute. See {@link resolveWebSocketUrl}. */
  readonly url: string;
  readonly serialization: Layer.Layer<RpcSerialization.RpcSerialization>;
  /** Default `true` — ride out drops instead of failing the client. */
  readonly retryTransientErrors?: boolean | undefined;
}) =>
  Layer.unwrap(
    Effect.sync(() =>
      RpcClient.layerProtocolSocket({
        retryTransientErrors: options.retryTransientErrors ?? true,
      }).pipe(
        Layer.provide(
          Layer.mergeAll(
            Socket.layerWebSocket(resolveWebSocketUrl(options.url)).pipe(
              Layer.provide(Socket.layerWebSocketConstructorGlobal),
            ),
            options.serialization,
          ),
        ),
        Layer.provideMerge(rpcConnectionLayer),
      ),
    ),
  );
