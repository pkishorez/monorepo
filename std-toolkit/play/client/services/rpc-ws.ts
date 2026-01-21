import { Socket } from "@effect/platform";
import { BrowserSocket } from "@effect/platform-browser";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Effect, Layer } from "effect";
import { AppRpcs } from "../../src/rpc";

// WebSocket URL (relative to current host)
const wsUrl =
  (window.location.protocol === "https:" ? "wss:" : "ws:") +
  "//" +
  window.location.host +
  "/api/ws";

// Socket layer from WebSocket
const SocketLive = Socket.layerWebSocket(wsUrl).pipe(
  Layer.provide(BrowserSocket.layerWebSocketConstructor),
);

// Protocol and serialization layers
const ProtocolLive = RpcClient.layerProtocolSocket().pipe(
  Layer.provide(SocketLive),
  Layer.provide(RpcSerialization.layerNdjson),
);

// RPC client service - scoped keeps connection alive with runtime
export class RpcWs extends Effect.Service<RpcWs>()("RpcWs", {
  scoped: RpcClient.make(AppRpcs),
  dependencies: [ProtocolLive],
}) {}
