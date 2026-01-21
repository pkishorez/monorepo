export { MyDurableObject } from "./do";

interface Env {
  MY_DURABLE_OBJECT: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const id = env.MY_DURABLE_OBJECT.idFromName("default");
    const stub = env.MY_DURABLE_OBJECT.get(id);

    if (url.pathname === "/api/hello") {
      return new Response("Hello from Worker!");
    }

    // WebSocket RPC via Durable Object
    if (url.pathname === "/api/ws" || url.pathname === "/api/ws/rpc") {
      return stub.fetch(request);
    }

    // HTTP RPC is disabled - use WebSocket RPC via /api/ws
    if (url.pathname === "/api/rpc") {
      return new Response(
        JSON.stringify({ error: "HTTP RPC disabled. Use WebSocket RPC via /api/ws" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
};
