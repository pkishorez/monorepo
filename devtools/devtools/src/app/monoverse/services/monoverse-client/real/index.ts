import { Layer } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { RpcClient, RpcSerialization } from 'effect/rpc';

import {
  MONOVERSE_RPC_PATH,
  MonoverseRpc,
} from '../../../server/rpc/contract/index.js';
import { MonoverseClient } from '../contract/index.js';

/** The client of the DevTools Server at `origin`. */
export const monoverseClientLayer = (origin: string) =>
  Layer.effect(MonoverseClient, RpcClient.make(MonoverseRpc)).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({
        url: origin,
        transformClient: HttpClient.mapRequest(
          HttpClientRequest.appendUrl(MONOVERSE_RPC_PATH),
        ),
      }),
    ),
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  );
