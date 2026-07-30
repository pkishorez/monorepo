import type * as cf from '@cloudflare/workers-types';
import * as Effect from 'effect/Effect';
import * as HttpBody from 'effect/unstable/http/HttpBody';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';

/**
 * The slice of a hibernation-capable WebSocket wrapper this package needs.
 *
 * Structural on purpose: `alchemy/Cloudflare`'s `WebSocket` already satisfies
 * it, and {@link fromDurableObjectState} builds one from raw workerd.
 */
export interface HibernatingSocket {
  readonly ws: cf.WebSocket;
  close(code: number, reason: string): Effect.Effect<void>;
  serializeAttachment<T>(value: T): void;
  deserializeAttachment<T>(): T | null;
}

/**
 * The slice of a Durable Object's state this package needs. `R` is whatever
 * context the host's effects require — `never` for raw workerd,
 * `RuntimeContext` for alchemy.
 */
export interface HibernationState<R = never> {
  getWebSockets(
    tag?: string,
  ): Effect.Effect<ReadonlyArray<HibernatingSocket>, never, R>;
  setWebSocketAutoResponse(
    pair?: cf.WebSocketRequestResponsePair,
  ): Effect.Effect<void, never, R>;
}

/** Performs the 101 upgrade and hands back the server half of the pair. */
export type Upgrade<R = never> = () => Effect.Effect<
  readonly [HttpServerResponse.HttpServerResponse, HibernatingSocket],
  never,
  R
>;

const wrapSocket = (ws: cf.WebSocket): HibernatingSocket => ({
  ws,
  close: (code, reason) => Effect.sync(() => ws.close(code, reason)),
  serializeAttachment: (value) => ws.serializeAttachment(value),
  deserializeAttachment: <T>() => ws.deserializeAttachment() as T | null,
});

/**
 * Adapter for callers not using alchemy: wraps a raw workerd
 * `DurableObjectState` into the `state`/`upgrade` pair
 * `makeHibernatingWebSocketRpc` expects.
 */
export const fromDurableObjectState = (
  state: cf.DurableObjectState,
): { readonly state: HibernationState; readonly upgrade: Upgrade } => ({
  state: {
    getWebSockets: (tag) =>
      Effect.sync(() => state.getWebSockets(tag).map(wrapSocket)),
    setWebSocketAutoResponse: (pair) =>
      Effect.sync(() => state.setWebSocketAutoResponse(pair)),
  },
  upgrade: () =>
    Effect.sync(() => {
      const [client, server] = new (
        globalThis as typeof globalThis & {
          WebSocketPair: new () => [cf.WebSocket, cf.WebSocket];
        }
      ).WebSocketPair();
      state.acceptWebSocket(server);
      const raw = new Response(null, {
        status: 101,
        webSocket: client,
      } as ResponseInit);
      return [
        HttpServerResponse.setBody(
          HttpServerResponse.empty({ status: 101 }),
          HttpBody.raw(raw),
        ),
        wrapSocket(server),
      ] as const;
    }),
});
