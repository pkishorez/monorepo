import { HttpApp } from "@effect/platform";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import { Effect, Layer } from "effect";
import { HandlersLive } from "./handlers";
import { AppRpcs } from "./rpc";

export { MyDurableObject } from "./do";

interface Env {
  MY_DURABLE_OBJECT: DurableObjectNamespace;
}

// RPC app that handles requests
const rpcApp = Effect.flatMap(RpcServer.toHttpApp(AppRpcs), (app) => app);

// Layer with handlers and serialization
const AppLive = Layer.mergeAll(HandlersLive, RpcSerialization.layerNdjson);

// Web handler with layer
const { handler: rpcHandler } = HttpApp.toWebHandlerLayer(rpcApp, AppLive);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const id = env.MY_DURABLE_OBJECT.idFromName("default");
    const stub = env.MY_DURABLE_OBJECT.get(id);

    if (url.pathname === "/api/hello") {
      return new Response("Hello from Worker!");
    }

    // WebSocket RPC via Durable Object
    if (url.pathname === "/api/ws") {
      return stub.fetch(request);
    }
    if (url.pathname === "/api/ws/rpc") {
      return stub.fetch(request);
    }

    if (url.pathname === "/api/rpc") {
      return rpcHandler(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};
