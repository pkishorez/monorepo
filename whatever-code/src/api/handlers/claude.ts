import { Effect } from "effect";
import { ClaudeChatError, ClaudeRpcs } from "../definitions/claude.js";
import { ClaudeOrchestrator } from "../../agents/claude/claude.js";
import { claudeMessageSqliteEntity } from "../../db/entities/claude.js";
import { applyProjection } from "../../projection/index.js";

export const ClaudeHandlers = ClaudeRpcs.toLayer(
  ClaudeRpcs.of({
    "claude.createSession": (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.createSession(params)),
    "claude.continueSession": (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.continueSession(params)),
    "claude.stopSession": ({ sessionId }) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.stopSession(sessionId)),
    "claude.updateSession": (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.updateSession(params)).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
      ),
    "claude.respondToTool": (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.respondToTool(params)),
    "claude.queryMessages": ({ ">": cursor }) =>
      Effect.gen(function* () {
        let currentCursor = cursor;
        const projected: NonNullable<ReturnType<typeof applyProjection>>[] = [];

        while (true) {
          const { items } = yield* claudeMessageSqliteEntity.query(
            "byUpdatedAt",
            { pk: {}, sk: { ">": currentCursor } },
          );
          if (items.length === 0) break;

          for (const item of items) {
            const p = applyProjection(item);
            if (p) projected.push(p);
          }

          const lastU = items[items.length - 1]!.meta._u;
          if (lastU === currentCursor) break;
          currentCursor = lastU;

          if (projected.length > 0) break;
        }

        return projected;
      }).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
      ),
    "claude.queryMessagesBySession": ({ sessionId, ">": cursor }) =>
      Effect.gen(function* () {
        let currentCursor = cursor;
        const projected: NonNullable<ReturnType<typeof applyProjection>>[] = [];

        while (true) {
          const { items } = yield* claudeMessageSqliteEntity.query(
            "bySession",
            { pk: { sessionId }, sk: { ">": currentCursor } },
          );
          if (items.length === 0) break;

          for (const item of items) {
            const p = applyProjection(item);
            if (p) projected.push(p);
          }

          const lastU = items[items.length - 1]!.meta._u;
          if (lastU === currentCursor) break;
          currentCursor = lastU;

          if (projected.length > 0) break;
        }

        return projected;
      }).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
      ),
  }),
);
