import { Effect } from "effect";
import { ClaudeChatError, ClaudeRpcs } from "../definitions/claude.js";
import { ClaudeOrchestrator } from "../../claude/claude.js";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../../db/claude.js";

export const ClaudeHandlers = ClaudeRpcs.toLayer(
  ClaudeRpcs.of({
    "claude.createSession": (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.createSession(params)),
    "claude.continueSession": (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.continueSession(params)),
    "claude.stopSession": ({ sessionId }) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.stopSession(sessionId)),
    "claude.respondToTool": (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.respondToTool(params)).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
      ),
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
      Effect.flatMap(ClaudeOrchestrator, (o) => o.getCapabilities(absolutePath)).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
      ),
  }),
);
