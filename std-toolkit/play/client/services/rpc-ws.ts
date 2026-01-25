import { Socket } from "@effect/platform";
import { BrowserSocket } from "@effect/platform-browser";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Effect, Layer } from "effect";
import { AppRpcs } from "../../domain";
import { makeProtocolSocket } from "@std-toolkit/core/client";
import { Protocol } from "@effect/rpc/RpcClient";
import { broadcastCollections } from "@std-toolkit/tanstack";

export class RpcWs extends Effect.Service<RpcWs>()("RpcWs", {
  scoped: Effect.gen(function* () {
    const collections = broadcastCollections();
    const wsUrl =
      (window.location.protocol === "https:" ? "wss:" : "ws:") +
      "//" +
      window.location.host +
      "/api/ws";

    const SocketLive = Socket.layerWebSocket(wsUrl).pipe(
      Layer.provide(BrowserSocket.layerWebSocketConstructor),
    );

    return {
      collections,
      api: yield* RpcClient.make(AppRpcs).pipe(
        Effect.provide(
          Layer.effect(
            Protocol,
            makeProtocolSocket({
              onOtherMessage: collections.process,
            }),
          ).pipe(
            Layer.provide(SocketLive),
            Layer.provide(RpcSerialization.layerNdjson),
          ),
        ),
      ),
    };
  }),
  dependencies: [],
}) {}
