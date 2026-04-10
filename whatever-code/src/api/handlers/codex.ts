import { Effect } from "effect";
import { CodexChatError, CodexRpcs } from "../definitions/codex.js";
import { CodexOrchestrator } from "../../agents/codex/codex.js";
import { codexEventSqliteEntity } from "../../db/entities/codex.js";
import { applyProjection } from "../../projection/index.js";

export const CodexHandlers = CodexRpcs.toLayer(
  CodexRpcs.of({
    "codex.createThread": (params) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.createThread(params)),
    "codex.continueThread": (params) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.continueThread(params)),
    "codex.stopThread": ({ sessionId }) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.stopThread(sessionId)),
    "codex.updateThread": (params) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.updateThread(params)).pipe(
        Effect.mapError((e) => new CodexChatError({ message: String(e) })),
      ),
    "codex.respondToUserInput": (params) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.respondToUserInput(params)),
    "codex.queryEvents": ({ ">": cursor }) =>
      codexEventSqliteEntity
        .query("byUpdatedAt", { pk: {}, sk: { ">": cursor } })
        .pipe(
          Effect.map(({ items }) =>
            items
              .map(applyProjection)
              .filter((v): v is NonNullable<typeof v> => v !== null),
          ),
          Effect.mapError((e) => new CodexChatError({ message: String(e) })),
        ),
  }),
);
