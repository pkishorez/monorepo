import { RpcSerialization } from "@effect/rpc";
import { DurableObject, env as Env } from "cloudflare:workers";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqliteDBDO } from "@std-toolkit/sqlite/adapters/do";
import { AppRpcs, UsersTable } from "../domain";
import { HandlersLive } from "./handlers";
import {
  handleMessage,
  pingConst,
  pongConst,
  typedWebSocket,
} from "@std-toolkit/core/server";

let clientIdCounter = 0;

export class MyDurableObject extends DurableObject {
  private _runtime: ManagedRuntime.ManagedRuntime<any, any> | null = null;

  constructor(ctx: DurableObjectState, env: typeof Env) {
    super(ctx, env);

    console.log("MyDurableObject constructed");
  }
  private async getRuntime() {
    if (this._runtime) return this._runtime!;

    const sqliteLayer = SqliteDBDO(this.ctx.storage.sql);
    const AppLive = Layer.mergeAll(
      HandlersLive.pipe(Layer.provideMerge(sqliteLayer)),
      RpcSerialization.layerNdjson,
    );

    const runtime = ManagedRuntime.make(AppLive);

    // Setup tables
    await runtime.runPromise(
      UsersTable.setup().pipe(Effect.provide(sqliteLayer)),
    );

    this._runtime = runtime;
    return runtime;
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();

    // Hybernation
    this.ctx.acceptWebSocket(server);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(pingConst, pongConst),
    );

    typedWebSocket.set(server as any, {
      subscriptionEntities: new Set(),
      clientId: clientIdCounter++,
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // We only support string messages for now.
    if (typeof message !== "string") return;

    const runtime = await this.getRuntime();
    await runtime.runPromise(
      handleMessage(this.ctx as any, ws as any, AppRpcs, message),
    );
  }
}
