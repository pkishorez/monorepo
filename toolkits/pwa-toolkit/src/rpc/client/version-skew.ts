import * as Effect from 'effect/Effect';
import type * as RpcClient from 'effect/rpc/RpcClient';
import type { FromServerEncoded } from 'effect/rpc/RpcMessage';
import { VersionSkew } from '../handshake/index.js';

/**
 * The last handshake's Version Skew, if any, and the controller that
 * reported it. Cleared by the next READY.
 */
export const makeSkewState = () => {
  let current:
    | { readonly skew: VersionSkew; readonly controller: ServiceWorker }
    | undefined;
  return {
    get skew() {
      return current?.skew;
    },
    get controller() {
      return current?.controller;
    },
    set(skew: VersionSkew, controller: ServiceWorker) {
      current = { skew, controller };
    },
    clear() {
      current = undefined;
    },
  };
};
export type SkewState = ReturnType<typeof makeSkewState>;

const skewOf = (message: FromServerEncoded): VersionSkew | undefined => {
  if (message._tag !== 'ClientProtocolError') return undefined;
  const cause: unknown = (message.error.reason as { cause?: unknown }).cause;
  return cause instanceof VersionSkew ? cause : undefined;
};

/**
 * Surfaces Version Skew to calls as the typed `VersionSkew` error instead of
 * an `RpcClientError`. The platform reports skew as a failed connection whose
 * cause is the `VersionSkew`; this unwraps it. While skew is known, new calls
 * fail at once instead of waiting for a connection that cannot open.
 */
export const withVersionSkew = (
  protocol: RpcClient.Protocol['Service'],
  state: SkewState,
): RpcClient.Protocol['Service'] => {
  const writers = new Map<
    number,
    (message: FromServerEncoded) => Effect.Effect<void>
  >();
  const failWith = (skew: VersionSkew): FromServerEncoded =>
    ({ _tag: 'ClientProtocolError', error: skew }) as never;

  return {
    ...protocol,
    run: (clientId, write) => {
      writers.set(clientId, write);
      return protocol.run(clientId, (message) => {
        const skew = skewOf(message);
        return write(skew ? failWith(skew) : message);
      });
    },
    send: (clientId, request, transferables) => {
      const skew = state.skew;
      const write = writers.get(clientId);
      return skew && write && request._tag === 'Request'
        ? write(failWith(skew))
        : protocol.send(clientId, request, transferables);
    },
  };
};
