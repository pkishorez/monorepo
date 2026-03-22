import { Effect } from "effect";
import { CodexChatError, CodexRpcs } from "../definitions/codex.js";
import { CodexOrchestrator } from "../../codex/codex.js";
import {
  codexEventSqliteEntity,
  codexThreadSqliteEntity,
  codexTurnSqliteEntity,
} from "../../db/codex.js";

export const CodexHandlers = CodexRpcs.toLayer(
  CodexRpcs.of({
    "codex.createThread": (params) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.createThread(params)),
    "codex.continueThread": (params) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.continueThread(params)),
    "codex.stopThread": ({ threadId }) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.stopThread(threadId)),
    "codex.updateThread": (params) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.updateThread(params)).pipe(
        Effect.mapError((e) => new CodexChatError({ message: String(e) })),
      ),
    "codex.respondToApproval": (params) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.respondToApproval(params)),
    "codex.queryEvents": ({ ">": cursor }) =>
      codexEventSqliteEntity
        .query("byUpdatedAt", { pk: {}, sk: { ">": cursor } })
        .pipe(
          Effect.map(({ items }) => items),
          Effect.mapError((e) => new CodexChatError({ message: String(e) })),
        ),
    "codex.queryThreads": ({ ">": cursor }) =>
      codexThreadSqliteEntity
        .query("byUpdatedAt", { pk: {}, sk: { ">": cursor } })
        .pipe(
          Effect.map(({ items }) => items),
          Effect.mapError((e) => new CodexChatError({ message: String(e) })),
        ),
    "codex.queryTurns": ({ ">": cursor }) =>
      codexTurnSqliteEntity
        .query("byUpdatedAt", { pk: {}, sk: { ">": cursor } })
        .pipe(
          Effect.map(({ items }) => items),
          Effect.mapError((e) => new CodexChatError({ message: String(e) })),
        ),
  }),
);
