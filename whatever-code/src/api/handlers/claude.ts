import { Effect } from "effect";
import { ClaudeChatError, ClaudeRpcs } from "../definitions/claude.js";
import { ClaudeOrchestrator } from "../../claude/orchestrator.js";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../../db/claude.js";
import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import { computePaths } from "../../lib/paths.js";

export const ClaudeHandlers = ClaudeRpcs.toLayer(
  ClaudeRpcs.of({
    "claude.createSession": (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.createSession(params)),
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
    "claude.getProjects": () =>
      Effect.tryPromise({
        try: () => listSessions(),
        catch: (e) => new ClaudeChatError({ message: String(e) }),
      }).pipe(
        Effect.map((sessions) => {
          const counts = new Map<string, number>();
          for (const s of sessions) {
            if (s.cwd) counts.set(s.cwd, (counts.get(s.cwd) ?? 0) + 1);
          }
          return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([cwd, sessionCount]) => ({
              ...computePaths(cwd),
              sessionCount,
            }));
        }),
      ),
  }),
);
