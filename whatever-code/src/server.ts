import { createServer } from "node:http";
import {
  HttpLayerRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import { Effect, Layer, Option } from "effect";
import { ApiRpcs } from "./api/definitions/index.js";
import { ApiHandlers } from "./api/handlers/index.js";
import { dbLayer } from "./db/index.js";

interface ServerConfig {
  port: number;
  proxyTarget?: string;
}

export function startServer(config: ServerConfig) {
  const RpcRoute = RpcServer.layerHttpRouter({
    group: ApiRpcs,
    path: "/api",
    protocol: "websocket",
  }).pipe(
    Layer.provide(ApiHandlers),
    Layer.provide(RpcSerialization.layerNdjson),
  );

  const ProxyRoute = Option.fromNullable(config.proxyTarget).pipe(
    Option.map((target) =>
      HttpLayerRouter.add(
        "*",
        "/*",
        Effect.gen(function* () {
          const req = yield* HttpServerRequest.HttpServerRequest;
          const url = new URL(req.url, "http://localhost");
          const response = yield* Effect.tryPromise(() =>
            fetch(`${target}${url.pathname}${url.search}`, {
              method: req.method,
              headers: req.headers as Record<string, string>,
            }),
          );
          return HttpServerResponse.fromWeb(response);
        }),
      ),
    ),
    Option.getOrElse(() => Layer.empty),
  );

  const AllRoutes = Layer.mergeAll(RpcRoute, ProxyRoute);

  const ServerLayer = HttpLayerRouter.serve(AllRoutes).pipe(
    Layer.provide(dbLayer),
    Layer.provide(NodeHttpServer.layer(createServer, { port: config.port })),
  );

  NodeRuntime.runMain(Layer.launch(ServerLayer));
}
