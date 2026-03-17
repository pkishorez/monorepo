import { Effect } from "effect";
import { ulid } from "ulid";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../../db/claude.js";

export const persistNewTurn = (
  sessionId: string,
  turnId: string,
  prompt: string,
) =>
  Effect.all([
    claudeSessionSqliteEntity.update(
      { id: sessionId },
      { status: "in_progress" },
    ),
    claudeTurnSqliteEntity.insert({
      id: turnId,
      sessionId,
      status: "in_progress",
      init: null,
      result: null,
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
