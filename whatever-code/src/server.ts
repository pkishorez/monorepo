import { createServer } from "node:http";
import {
  HttpLayerRouter,
  HttpMiddleware,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import { Effect, Layer, Option } from "effect";
import { ApiRpcs } from "./api/definitions/index.js";
import { ApiHandlers } from "./api/handlers/index.js";
import { dbLayer } from "./db/index.js";
import { ClaudeOrchestrator } from "./claude/claude.js";
import { CodexOrchestrator } from "./codex/codex.js";
import { CodexClient } from "./codex/client.js";
import { ServicesLayer } from "./services/index.js";
import { TelemetryLayer } from "./telemetry.js";

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
    HttpMiddleware.withTracerDisabledWhen(() => true),
    Layer.provide(ClaudeOrchestrator.Default),
    Layer.provide(CodexOrchestrator.Default),
    Layer.provide(CodexClient.Default),
    Layer.provide(ServicesLayer),
    Layer.provide(dbLayer),
    Layer.provide(NodeHttpServer.layer(createServer, { port: config.port })),
    Layer.provide(TelemetryLayer),
  );

  NodeRuntime.runMain(Layer.launch(ServerLayer));
}
