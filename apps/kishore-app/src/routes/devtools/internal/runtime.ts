import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from 'effect/unstable/http';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { DevtoolsRpc } from '@kishorez/devtools/rpc';

type Client = Effect.Success<ReturnType<typeof makeClientEffect>>;

const makeClientEffect = () => RpcClient.make(DevtoolsRpc);

export class DevtoolsClient extends Context.Service<DevtoolsClient, Client>()(
  'devtools-route/DevtoolsClient',
) {}

const makeProtocolLayer = (baseUrl: string) =>
  RpcClient.layerProtocolHttp({
    url: baseUrl,
    transformClient: HttpClient.mapRequest(HttpClientRequest.appendUrl('/rpc')),
  }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  );

export const makeDevtoolsClientLayer = (baseUrl: string) =>
  Layer.effect(DevtoolsClient, makeClientEffect()).pipe(
    Layer.provide(makeProtocolLayer(baseUrl)),
  );

export type DevtoolsRuntime = ManagedRuntime.ManagedRuntime<
  DevtoolsClient,
  never
>;

/**
 * Build a `ManagedRuntime` carrying an RPC client for the DevTools server at
 * `baseUrl` (e.g. `http://127.0.0.1:14400`). Procedures are reached through
 * {@link DevtoolsClient}.
 */
export const makeDevtoolsRuntime = (baseUrl: string): DevtoolsRuntime =>
  ManagedRuntime.make(makeDevtoolsClientLayer(baseUrl));
