import { Context, Effect, Layer, Schema } from 'effect';
import { RpcClient, type RpcClientError } from 'effect/rpc';
import { client } from '@kestack/rpc-toolkit/rpc/http';
import {
  AUTH_PATH,
  AuthInfo,
  MachinesApi,
  RPC_PATH,
} from '../contract/index.js';

/*
 * The Machines Backend as a client calls it: the RPC over HTTP at
 * `<backend>/rpc`, every call signed by whatever signs the app's calls
 * (auth-toolkit's `browser()` in the app, `device()` or a Local Token in
 * `serve`), and `authInfo`, the one call that needs no Sign-in: how a
 * Machine signs in to this Backend.
 */

/** `base` without a trailing slash, then `path`. */
const at = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

export class MachinesClient extends Context.Service<
  MachinesClient,
  RpcClient.FromGroup<typeof MachinesApi, RpcClientError.RpcClientError>
>()('@kestack/ai-toolkit/MachinesClient') {
  /** The Backend at `backend`, its base URL such as `https://api-code.kishore.app`. */
  static readonly layer = (backend: string) =>
    Layer.effect(MachinesClient, RpcClient.make(MachinesApi)).pipe(
      Layer.provide(client(MachinesApi, { url: at(backend, RPC_PATH) })),
    );
}

/** Why a fetch failed, as plainly as it says: `fetch failed` hides the cause. */
const reason = (cause: unknown): string => {
  if (!(cause instanceof Error)) return String(cause);
  const inner = cause.cause;
  return inner instanceof Error
    ? `${cause.message}: ${inner.message}`
    : cause.message;
};

/** How a Machine signs in to the Backend at `backend`; fails when it cannot be asked. */
export const authInfo = (backend: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(at(backend, AUTH_PATH));
      if (!response.ok)
        throw new Error(`${backend} answered ${response.status}`);
      return (await response.json()) as unknown;
    },
    catch: (cause) =>
      new Error(
        `Could not ask ${backend} how to sign in (${reason(cause)}); is the Backend running?`,
        { cause },
      ),
  }).pipe(
    Effect.flatMap((body) =>
      Effect.mapError(
        Schema.decodeUnknownEffect(AuthInfo)(body),
        (cause) => new Error(`${backend} gave no AuthInfo`, { cause }),
      ),
    ),
  );
