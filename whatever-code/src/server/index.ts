import { createServer } from "node:http";
import { HttpLayerRouter, HttpMiddleware } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { ClaudeOrchestrator } from "../agents/claude/claude.js";
import { CodexOrchestrator } from "../agents/codex/codex.js";
import { CodexClient } from "../agents/codex/client.js";
import { WorkflowOrchestrator } from "../agents/workflow/index.js";
import { ServicesLayer } from "../services/index.js";
import { TelemetryLayer } from "../telemetry.js";
import { TerminalService } from "../terminal/index.js";
import { resumeExecutingLoops, recoverStaleWorkflows } from "../ralph-loop/index.js";
import { dbLayer } from "../db/index.js";
import { buildRpcRoute, buildProxyRoute, OtelRoute } from "./routes.js";

interface ServerConfig {
  port: number;
  proxyTarget?: string;
}

export function startServer(config: ServerConfig) {
  // ── Global safety net ──
  // Prevent the process from crashing on unexpected rejections or exceptions.
  // These handlers act as a last resort; the root causes should be fixed in
  // the service layer, but we never want the entire server to die.
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err);
  });

  const AllRoutes = Layer.mergeAll(
    buildRpcRoute(),
    OtelRoute,
    buildProxyRoute(config.proxyTarget),
  );

  // Recover stale workflow statuses, then resume any ralph loops that were
  // executing when the process last stopped.
  const StartupLayer = Layer.effectDiscard(
    Effect.forkDaemon(
      recoverStaleWorkflows.pipe(
        Effect.flatMap(() => resumeExecutingLoops),
        Effect.catchAll((e) =>
          Effect.logError("Startup recovery failed").pipe(
            Effect.annotateLogs({ error: String(e) }),
          ),
        ),
      ),
    ),
  );

  const ServerLayer = HttpLayerRouter.serve(
    Layer.mergeAll(AllRoutes, StartupLayer),
    { disableLogger: true },
  ).pipe(
    HttpMiddleware.withTracerDisabledWhen(() => true),
    Layer.provide(WorkflowOrchestrator.Default),
    Layer.provide(ClaudeOrchestrator.Default),
    Layer.provide(CodexOrchestrator.Default),
    Layer.provide(CodexClient.Default),
    Layer.provide(TerminalService.Default),
    Layer.provide(ServicesLayer),
    Layer.provide(dbLayer),
    Layer.provide(NodeHttpServer.layer(createServer, { port: config.port })),
    Layer.provide(TelemetryLayer),
  );

  NodeRuntime.runMain(Layer.launch(ServerLayer));
}
