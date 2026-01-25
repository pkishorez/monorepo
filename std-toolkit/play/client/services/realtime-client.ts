import { Socket } from "@effect/platform";
import { BrowserSocket } from "@effect/platform-browser";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Effect, Layer } from "effect";
import { AppRpcs } from "../../domain";
import { makeProtocolSocket } from "@std-toolkit/core/client";
import { Protocol } from "@effect/rpc/RpcClient";
import { broadcastCollections } from "@std-toolkit/tanstack";

export class RealtimeClient extends Effect.Service<RealtimeClient>()(
  "RealtimeClient",
  {
    scoped: Effect.gen(function* () {
      const collections = broadcastCollections();
      const wsUrl =
        (window.location.protocol === "https:" ? "wss:" : "ws:") +
        "//" +
        window.location.host +
        "/api/ws";

      const ProtocolLive = Layer.provide(
        Layer.effect(
          Protocol,
          makeProtocolSocket({ onOtherMessage: collections.process }),
        ),
        Layer.merge(
          Layer.provide(
            Socket.layerWebSocket(wsUrl),
            BrowserSocket.layerWebSocketConstructor,
          ),
          RpcSerialization.layerNdjson,
        ),
      );

      const api = yield* Effect.provide(RpcClient.make(AppRpcs), ProtocolLive);

      return { collections, api };
    }),
    dependencies: [],
  },
) {}
