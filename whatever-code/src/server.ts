import { serve } from "@hono/node-server";
import { HttpLayerRouter } from "@effect/platform";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import { Hono } from "hono";
import { proxy } from "hono/proxy";
import { Layer } from "effect";
import { ApiRpcs } from "./api/definitions/index.js";
import { ApiHandlers } from "./api/handlers/index.js";

interface ServerConfig {
  port: number;
  proxyTarget?: string;
}

export function startServer(config: ServerConfig) {
  const RpcRoute = RpcServer.layerHttpRouter({
    group: ApiRpcs,
    path: "/api",
    protocol: "http",
  }).pipe(
    Layer.provide(ApiHandlers),
    Layer.provide(RpcSerialization.layerNdjson),
  );

  const { dispose, handler: rpcHandler } =
    HttpLayerRouter.toWebHandler(RpcRoute);

  const app = new Hono();

  app.all("/api", (c) => rpcHandler(c.req.raw));

  if (config.proxyTarget) {
    const target = config.proxyTarget;
    app.all("*", (c) => {
      const url = new URL(c.req.url);
      return proxy(`${target}${url.pathname}${url.search}`, {
        ...c.req,
        headers: c.req.header(),
      });
    });
  }

  const server = serve({ fetch: app.fetch, port: config.port }, () => {
    console.log(`Server running on port ${config.port}`);
  });

  const shutdown = () => {
    server.close();
    dispose();
  };

  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });

  return { server, shutdown };
}
