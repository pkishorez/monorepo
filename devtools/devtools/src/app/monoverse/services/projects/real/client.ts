import { Layer } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import type { RpcClientError } from 'effect/rpc';

import {
  MONOVERSE_RPC_PATH,
  MonoverseRpc,
} from '../../../server/rpc/contract/index.js';

/*
 * The typed client of the Monoverse server's /rpc/monoverse, which the
 * Projects service speaks through; nothing outside it sees the client.
 */

export type Client = RpcClient.FromGroup<
  typeof MonoverseRpc,
  RpcClientError.RpcClientError
>;

/** The client, on the protocol `protocolAt` gives. */
export const makeClient = RpcClient.make(MonoverseRpc);

/** How the client reaches the DevTools Server at `origin`. */
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
