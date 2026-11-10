import { Context, Layer } from 'effect';
import { RpcClient, type RpcClientError } from 'effect/rpc';
import { client } from '@kestack/rpc-toolkit/rpc/http';
import {
  versionedClient,
  type VersionGap,
} from '@kestack/rpc-toolkit/rpc/version-gap';
import { AppApi, RPC_PATH } from '../app-api/index.js';

/*
 * Connect Cloud as an App calls it: `AppApi` over HTTP at `<cloud>/rpc`,
 * every call signed by whatever signs the App's calls (auth-toolkit's
 * `browser()`), each failing with `VersionGap` when one side is older. With
 * it, what an App needs to read its answers: a Connection, where its status
 * says it is, whether it is Outdated, and where Connect Cloud says a Release
 * stands.
 */

export { addressOf, ConnectionStatus } from '../../heartbeat/index.js';
export {
  Connection,
  DISPLAY_NAME_MAX,
  isOutdated,
  ReleaseStanding,
} from '../app-api/index.js';

/** `base` without a trailing slash, then `path`. */
const at = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

export class CloudClient extends Context.Service<
  CloudClient,
  RpcClient.FromGroup<typeof AppApi, RpcClientError.RpcClientError | VersionGap>
>()('@kestack/connect/CloudClient') {
  /** Connect Cloud at `cloud`, its base URL such as `https://connect.kishore.app`. */
  static readonly layer = (cloud: string) =>
    Layer.effect(CloudClient, versionedClient(AppApi)).pipe(
      Layer.provide(client(AppApi, { url: at(cloud, RPC_PATH) })),
    );
}
