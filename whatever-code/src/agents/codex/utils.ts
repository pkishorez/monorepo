import { Effect } from "effect";
import { ulid } from "ulid";
import { codexEventSqliteEntity } from "../../db/entities/codex.js";
import { turnSqliteEntity } from "../../db/entities/turn.js";
import { sessionSqliteEntity } from "../../db/entities/session.js";
import { initSessionsForType } from "../shared/session.js";
import { markTurnsInterrupted } from "../shared/turn.js";
import type { PromptContent } from "../shared/schema.js";

export { markTurnStatus } from "../shared/turn.js";

export const initSessions = initSessionsForType("codex", markTurnsInterrupted);

export const persistNewTurn = (
  sessionId: string,
  turnId: string,
  prompt: typeof PromptContent.Type,
  model: string,
) => {
  const textContent = typeof prompt === "string"
    ? prompt
    : prompt
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

  return Effect.all([
    sessionSqliteEntity.update({ sessionId }, { status: "in_progress" }),
    turnSqliteEntity.insert({
      id: turnId,
      type: "codex",
      sessionId,
      status: "in_progress",
      payload: {
        type: "codex",
        model,
        sdkTurnId: null,
        usage: null,
        error: null,
      },
    }),
    codexEventSqliteEntity.insert({
      id: ulid(),
      sessionId,
      turnId,
      data: {
        method: "item/started",
        params: {
          threadId: sessionId,
          turnId,
          item: {
            type: "userMessage",
            id: ulid(),
            content: [{ type: "text", text: textContent, text_elements: [] }],
          },
        },
      },
    }),
  ]).pipe(Effect.orDie);
};
