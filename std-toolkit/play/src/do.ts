import { RpcSerialization, RpcServer } from "@effect/rpc";
import { DurableObject } from "cloudflare:workers";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HandlersLive } from "./handlers";
import { AppRpcs } from "./rpc";

// Runtime for RPC handlers
const AppLive = Layer.mergeAll(HandlersLive, RpcSerialization.layerNdjson);
const runtime = ManagedRuntime.make(AppLive);

interface WsAttachment {
  clientId: number;
}

let clientIdCounter = 0;

export class MyDurableObject extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();

    // Accept with hibernation support
    this.ctx.acceptWebSocket(server);

    // Store clientId in attachment (survives hibernation)
    const attachment: WsAttachment = { clientId: clientIdCounter++ };
    server.serializeAttachment(attachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  // Hibernatable WebSocket handlers
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    const attachment = ws.deserializeAttachment() as WsAttachment;

    // Handle RPC message using serialization layer
    await runtime.runPromise(
      Effect.gen(function* () {
        const serialization = yield* RpcSerialization.RpcSerialization;
        const parser = serialization.unsafeMake();
        const decoded = parser.decode(message);

        const rpcServer = yield* RpcServer.makeNoSerialization(AppRpcs, {
          onFromServer: (response) =>
            Effect.sync(() => {
              console.log("RESPONSE: ", response);
              const encoded = parser.encode(response);
              if (encoded !== undefined) {
                ws.send(encoded);
              }
            }),
        });

        for (const msg of decoded) {
          console.log("END: ", msg);
          yield* rpcServer.write(attachment.clientId, msg as any);
        }
      }).pipe(Effect.scoped),
    );
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    // Connection closed - nothing to clean up with hibernation
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error("WebSocket error:", error);
    ws.close(1011, "WebSocket error");
  }
}
