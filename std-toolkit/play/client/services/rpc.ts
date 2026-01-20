import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Effect, Layer } from "effect";
import { AppRpcs } from "../../src/rpc";

export class Rpc extends Effect.Service<Rpc>()("Rpc", {
  scoped: RpcClient.make(AppRpcs),
  dependencies: [
    RpcClient.layerProtocolHttp({ url: "/api/rpc" }).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(RpcSerialization.layerNdjson),
    ),
  ],
}) {}
