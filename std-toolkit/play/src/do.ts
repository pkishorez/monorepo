import { RpcSerialization, RpcServer } from "@effect/rpc";
import { DurableObject } from "cloudflare:workers";
import { Deferred, Effect, Layer, ManagedRuntime } from "effect";
import { SqliteDBDO } from "@std-toolkit/sqlite/adapters/do";
import { AppRpcs, UsersTable } from "../domain";
import { HandlersLive } from "./handlers";

interface WsAttachment {
  clientId: number;
}

let clientIdCounter = 0;

export class MyDurableObject extends DurableObject {
  private runtime: ReturnType<typeof ManagedRuntime.make<any, any>> | null =
    null;
  private initialized = false;

  private async ensureInitialized() {
    if (this.initialized) return this.runtime!;

    const sqliteLayer = SqliteDBDO(this.ctx.storage.sql);
    const HandlersWithDb = HandlersLive.pipe(Layer.provide(sqliteLayer));
    const AppLive = Layer.mergeAll(
      HandlersWithDb,
      RpcSerialization.layerNdjson,
    );

    this.runtime = ManagedRuntime.make(AppLive);

    // Setup tables
    await Effect.runPromise(
      UsersTable.setup().pipe(Effect.provide(sqliteLayer)),
    );

    this.initialized = true;
    return this.runtime!;
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    await this.ensureInitialized();

    const { 0: client, 1: server } = new WebSocketPair();

    // Accept with hibernation support
    this.ctx.acceptWebSocket(server);

    // Auto-respond to protocol Ping without waking DO
    // NDJSON format includes trailing newline
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(
        '{"_tag":"Ping"}\n',
        '{"_tag":"Pong"}\n',
      ),
    );

    // Store clientId in attachment (survives hibernation)
    const attachment: WsAttachment = { clientId: clientIdCounter++ };
    server.serializeAttachment(attachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  // Hibernatable WebSocket handlers
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    const runtime = await this.ensureInitialized();
    const attachment = ws.deserializeAttachment() as WsAttachment;

    // Handle RPC message using serialization layer
    await runtime.runPromise(
      Effect.gen(function* () {
        const serialization = yield* RpcSerialization.RpcSerialization;
        const parser = serialization.unsafeMake();
        const decoded = parser.decode(message);

        // Latch to wait for stream completion
        const latch = yield* Deferred.make<void>();

        const rpcServer = yield* RpcServer.makeNoSerialization(AppRpcs, {
          disableClientAcks: true, // No ACKs needed - simpler for hibernation
          onFromServer: (response) =>
            Effect.gen(function* () {
              const encoded = parser.encode(response);
              if (encoded !== undefined) {
                ws.send(encoded);
              }
              // Complete latch when stream/request done
              const r = response as { _tag: string };
              if (r._tag === "Exit" || r._tag === "ClientEnd") {
                yield* Deferred.succeed(latch, undefined);
              }
            }),
        });

        for (const msg of decoded) {
          const m = msg as { _tag: string };
          if (m._tag === "Ping" || m._tag === "Pong") continue;
          yield* rpcServer.write(attachment.clientId, msg as any);
        }

        // Wait for completion before closing scope
        yield* Deferred.await(latch);
      }).pipe(Effect.scoped),
    );
  }

  async webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ) {
    // Nothing to clean up with hibernation
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error("WebSocket error:", error);
  }
}
