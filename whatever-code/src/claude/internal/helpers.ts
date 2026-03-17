import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { Effect } from "effect";
import { ulid } from "ulid";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../../db/claude.js";

export const makeUserMessage = (
  sessionId: string,
  prompt: string,
): SDKUserMessage => ({
  type: "user",
  message: { role: "user", content: prompt },
  parent_tool_use_id: null,
  session_id: sessionId,
});

export const persistNewTurn = (
  sessionId: string,
  turnId: string,
  userMessage: SDKUserMessage,
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
      data: userMessage,
    }),
  ]).pipe(Effect.orDie);
