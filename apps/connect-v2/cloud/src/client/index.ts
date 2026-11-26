import { Context, Layer } from 'effect';
import { RpcClient, type RpcClientError } from 'effect/rpc';
import { client } from '@kestack/rpc-toolkit/rpc/http';
import {
  versionedClient,
  type VersionGap,
} from '@kestack/rpc-toolkit/rpc/version-gap';
import { AppApi, RPC_PATH } from '../server/rpc/app/contract/index.js';

const at = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

export class CloudClient extends Context.Service<
  CloudClient,
  RpcClient.FromGroup<typeof AppApi, RpcClientError.RpcClientError | VersionGap>
>()('@kestack/connect-v2-cloud/CloudClient') {
  static readonly layer = (cloud: string) =>
    Layer.effect(CloudClient, versionedClient(AppApi)).pipe(
      Layer.provide(client(AppApi, { url: at(cloud, RPC_PATH) })),
    );
}
