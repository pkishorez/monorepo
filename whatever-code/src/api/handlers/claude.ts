import { Effect, Stream } from "effect";
import { ClaudeChatError, ClaudeRpcs } from "../definitions/claude.js";
import { ClaudeOrchestrator } from "../../claude/orchestrator.js";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../../db/claude.js";

export const ClaudeHandlers = ClaudeRpcs.toLayer(
  ClaudeRpcs.of({
    "claude.createSession": (params) =>
      Stream.unwrap(
        Effect.map(ClaudeOrchestrator, (o) => o.createSession(params)),
      ),
    "claude.continueSession": (params) =>
      Stream.unwrap(
        Effect.map(ClaudeOrchestrator, (o) => o.continueSession(params)),
      ),
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
  }),
);
