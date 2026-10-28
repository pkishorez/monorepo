import { Context, Effect, Layer, Schema } from 'effect';
import { RpcClient, type RpcClientError } from 'effect/rpc';
import { client } from '@kestack/rpc-toolkit/rpc/http';
import {
  AUTH_PATH,
  AuthInfo,
  CloudApi,
  RPC_PATH,
  versionedClient,
  type VersionGap,
} from '../contract/index.js';

/*
 * Cloud Connect as a client calls it: the RPC over HTTP at `<cloud>/rpc`,
 * every call signed by whatever signs the caller's calls (auth-toolkit's
 * `browser()` in an App, `device()` in `serve`), and `authInfo`, the one
 * call that needs no Sign-in: how a Connection signs in to this Cloud
 * Connect. With it, what an App needs to read its answers: a Connection,
 * where its status says it is, whether it is Outdated, and `VersionGap`,
 * which every call may fail with; and how to reach its Plugin at the
 * Release the App was built with, and what a close for another means.
 */

export {
  addressOf,
  Connection,
  ConnectionStatus,
  isOutdated,
  mismatchOf,
  PLUGIN_MISMATCH,
  pluginPath,
  PluginMismatch,
  VersionGap,
} from '../contract/index.js';

/** `base` without a trailing slash, then `path`. */
const at = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

export class CloudClient extends Context.Service<
  CloudClient,
  RpcClient.FromGroup<
    typeof CloudApi,
    RpcClientError.RpcClientError | VersionGap
  >
>()('@kestack/connect/CloudClient') {
  /** Cloud Connect at `cloud`, its base URL such as `https://connect.kishore.app`. */
  static readonly layer = (cloud: string) =>
    Layer.effect(CloudClient, versionedClient(CloudApi)).pipe(
      Layer.provide(client(CloudApi, { url: at(cloud, RPC_PATH) })),
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

/** How a Connection signs in to Cloud Connect at `cloud`; fails when it cannot be asked. Interrupting it aborts the fetch. */
export const authInfo = (cloud: string) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(at(cloud, AUTH_PATH), { signal });
      if (!response.ok) throw new Error(`${cloud} answered ${response.status}`);
      return (await response.json()) as unknown;
    },
    catch: (cause) =>
      new Error(
        `Could not ask ${cloud} how to sign in (${reason(cause)}); is Cloud Connect running?`,
        { cause },
      ),
  }).pipe(
    Effect.flatMap((body) =>
      Effect.mapError(
        Schema.decodeUnknownEffect(AuthInfo.schema)(body),
        (cause) => new Error(`${cloud} gave no AuthInfo`, { cause }),
      ),
    ),
  );
