import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization';
import { RpcClient } from 'effect/unstable/rpc';
import * as Socket from 'effect/unstable/socket/Socket';
import { rpcConnectionLayer } from './connection.ts';

/**
 * Resolves an RPC endpoint to an absolute `ws:`/`wss:` URL.
 *
 * A relative URL is resolved against `globalThis.location` and its scheme
 * swapped (`https:` → `wss:`, otherwise `ws:`); query and hash are dropped.
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
  resolved.search = '';
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
