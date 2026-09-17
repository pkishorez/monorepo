import { Context, Effect, Layer } from 'effect';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from 'effect/unstable/http';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { FlowRpc } from '../rpc/index.js';

export const DEFAULT_FLOW_ENDPOINT = 'http://127.0.0.1:14400';

type Client = Effect.Success<ReturnType<typeof makeClient>>;

const makeClient = () => RpcClient.make(FlowRpc);

/** An RPC client bound to one Flow Store endpoint. */
export class FlowRpcClient extends Context.Service<FlowRpcClient, Client>()(
  'flow/FlowRpcClient',
) {}

/** Builds the client Layer for the Flow Store hosted at `endpoint`. */
export const makeFlowRpcClientLayer = (options: {
  readonly endpoint?: string | undefined;
}) =>
  Layer.effect(FlowRpcClient, makeClient()).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({
        url: options.endpoint ?? DEFAULT_FLOW_ENDPOINT,
        transformClient: HttpClient.mapRequest(
          HttpClientRequest.appendUrl('/rpc'),
        ),
      }).pipe(
        Layer.provide(RpcSerialization.layerNdjson),
        Layer.provide(FetchHttpClient.layer),
      ),
    ),
  );
