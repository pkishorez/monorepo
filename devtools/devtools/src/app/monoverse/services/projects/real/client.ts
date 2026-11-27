import { Layer } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import type { RpcClientError } from 'effect/rpc';

import {
  MONOVERSE_RPC_PATH,
  MonoverseRpc,
} from '../../../server/rpc/contract/index.js';

export type Client = RpcClient.FromGroup<
  typeof MonoverseRpc,
  RpcClientError.RpcClientError
>;

export const makeClient = RpcClient.make(MonoverseRpc);

export const protocolAt = (origin: string) =>
  RpcClient.layerProtocolHttp({
    url: origin,
    transformClient: HttpClient.mapRequest(
      HttpClientRequest.appendUrl(MONOVERSE_RPC_PATH),
    ),
  }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  );
