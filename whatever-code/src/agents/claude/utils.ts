import { Effect } from "effect";
import { ulid } from "ulid";
import { claudeMessageSqliteEntity } from "../../db/entities/claude.js";
import { turnSqliteEntity } from "../../db/entities/turn.js";
import { sessionSqliteEntity } from "../../db/entities/session.js";
import { initSessionsForType } from "../shared/session.js";
import { markTurnsInterrupted } from "../shared/turn.js";
import type { PromptContent } from "../shared/schema.js";

export { markTurnStatus } from "../shared/turn.js";

export const initSessions = initSessionsForType("claude", markTurnsInterrupted);

export const persistNewTurn = (
  sessionId: string,
  turnId: string,
  prompt: typeof PromptContent.Type,
) =>
  Effect.all([
    sessionSqliteEntity.update({ sessionId }, { status: "in_progress" }),
    turnSqliteEntity.insert({
      id: turnId,
      type: "claude",
      sessionId,
      status: "in_progress",
      payload: {
        type: "claude",
        model: null,
        costUsd: null,
        isError: null,
        modelUsage: null,
        lastInputTokens: null,
      },
    }),
    claudeMessageSqliteEntity.insert({
      id: ulid(),
      sessionId,
      turnId,
      data: {
        type: "user",
        message: { role: "user", content: prompt },
        parent_tool_use_id: null,
        session_id: sessionId,
      },
    }),
  ]).pipe(Effect.orDie);
