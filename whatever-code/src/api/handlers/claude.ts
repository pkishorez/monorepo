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
    "claude.updateModel": (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.updateModel(params)).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
      ),
    "claude.updateMode": (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.updateMode(params)).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
      ),
    "claude.getModels": () =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.getModels()).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
      ),
  }),
);
