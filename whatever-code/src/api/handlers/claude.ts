import { Effect } from "effect";
import { v7 } from "uuid";
import { ClaudeChatError, ClaudeRpcs } from "../definitions/claude.js";
import { ClaudeOrchestrator } from "../../claude/claude.js";
import { fetchSessionCapabilities } from "../../claude/internal/fetch-capabilities.js";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
  projectSqliteEntity,
} from "../../db/claude.js";

export const ClaudeHandlers = ClaudeRpcs.toLayer(
  ClaudeRpcs.of({
    "claude.createSession": (params) =>
      Effect.gen(function* () {
        const sessionId = v7();
        yield* claudeSessionSqliteEntity
          .insert({
            id: sessionId,
            status: "success",
            sdkSessionCreated: false,
            absolutePath: params.absolutePath,
            name: "New Session",
            ...(params.model !== undefined ? { model: params.model } : {}),
            ...(params.permissionMode !== undefined
              ? { permissionMode: params.permissionMode }
              : {}),
          })
          .pipe(Effect.orDie);

        yield* projectSqliteEntity
          .update(
            { id: params.absolutePath },
            { sessionId, status: "idle" },
          )
          .pipe(Effect.orDie);

        const orchestrator = yield* ClaudeOrchestrator;
        yield* orchestrator.continueSession({
          sessionId,
          prompt: params.prompt,
        });
      }).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
      ),
    "claude.continueSession": (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.continueSession(params)),
    "claude.stopSession": ({ sessionId }) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.stopSession(sessionId)),
    "claude.queryMessages": ({ ">": cursor }) =>
      claudeMessageSqliteEntity
        .query("byUpdatedAt", { pk: {}, sk: { ">": cursor } })
        .pipe(
          Effect.map(({ items }) => items),
          Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
        ),
    "claude.querySessions": ({ ">": cursor }) =>
      claudeSessionSqliteEntity
        .query("byUpdatedAt", { pk: {}, sk: { ">": cursor } })
        .pipe(
          Effect.map(({ items }) => items),
          Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
        ),
    "claude.queryTurns": ({ ">": cursor }) =>
      claudeTurnSqliteEntity
        .query("byUpdatedAt", { pk: {}, sk: { ">": cursor } })
        .pipe(
          Effect.map(({ items }) => items),
          Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
        ),
    "claude.getSessionStatus": ({ sessionId }) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.getSessionStatus(sessionId)).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
      ),
    "claude.updateSession": (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.updateSession(params)).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
      ),
    "claude.getCapabilities": ({ absolutePath }) =>
      fetchSessionCapabilities(absolutePath).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
      ),
  }),
);
