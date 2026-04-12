import { Effect } from "effect";
import { ulid } from "ulid";
import { claudeMessageSqliteEntity } from "../../db/entities/claude.js";
import { turnSqliteEntity } from "../../db/entities/turn.js";
import { sessionSqliteEntity } from "../../db/entities/session.js";
import { initSessionsForType } from "../shared/session.js";
import { markTurnsInterrupted } from "../shared/turn.js";
import type { PromptContent } from "../shared/schema.js";

export { markTurnStatus, findQueuedTurn } from "../shared/turn.js";

export const initSessions = initSessionsForType("claude", markTurnsInterrupted);

// ── Internal helpers ──

const makeClaudeTurnInsert = (
  sessionId: string,
  turnId: string,
  status: "in_progress" | "queued",
) =>
  turnSqliteEntity.insert({
    id: turnId,
    type: "claude",
    sessionId,
    status,
    payload: {
      type: "claude",
      model: null,
      costUsd: null,
      isError: null,
      modelUsage: null,
      lastInputTokens: null,
      cwd: null,
      resultSubtype: null,
      resultErrors: null,
      pendingQuestions: {},
    },
  });

const insertClaudeUserMessage = (
  sessionId: string,
  turnId: string,
  prompt: typeof PromptContent.Type,
) =>
  claudeMessageSqliteEntity.insert({
    id: ulid(),
    sessionId,
    turnId,
    data: {
      type: "user",
      message: { role: "user", content: prompt as any },
      parent_tool_use_id: null,
      session_id: sessionId,
    },
  });

// ── Exports ──

export const persistNewTurn = (
  sessionId: string,
  turnId: string,
  prompt: typeof PromptContent.Type,
) =>
  Effect.all([
    sessionSqliteEntity.update({ sessionId }, { status: "in_progress" }),
    makeClaudeTurnInsert(sessionId, turnId, "in_progress"),
    insertClaudeUserMessage(sessionId, turnId, prompt),
  ]).pipe(Effect.orDie);

export const persistQueuedTurn = (
  sessionId: string,
  turnId: string,
  prompt: typeof PromptContent.Type,
) =>
  Effect.all([
    makeClaudeTurnInsert(sessionId, turnId, "queued"),
    insertClaudeUserMessage(sessionId, turnId, prompt),
  ]).pipe(Effect.orDie);

/** Merges a new prompt into the existing user message of a queued turn. */
export const appendToQueuedTurn = (
  sessionId: string,
  turnId: string,
  prompt: typeof PromptContent.Type,
) =>
  Effect.gen(function* () {
    const result = yield* claudeMessageSqliteEntity
      .query("byTurn", { pk: { turnId }, sk: { ">": null } })
      .pipe(Effect.orDie);

    const existing = result.items.find(
      (m) => (m.value.data as any).type === "user",
    );

    if (!existing) {
      yield* insertClaudeUserMessage(sessionId, turnId, prompt).pipe(Effect.orDie);
      return;
    }

    const existingContent = (existing.value.data as any).message
      .content as typeof PromptContent.Type;
    const merged = [...promptToBlocks(existingContent), ...promptToBlocks(prompt)];

    yield* claudeMessageSqliteEntity
      .update(
        { id: existing.value.id },
        {
          data: {
            type: "user",
            message: { role: "user", content: merged as any },
            parent_tool_use_id: null,
            session_id: sessionId,
          },
        },
      )
      .pipe(Effect.orDie);
  });

/** Normalises a single PromptContent value into an array of content blocks. */
function promptToBlocks(
  prompt: typeof PromptContent.Type,
): Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }> {
  if (typeof prompt === "string") {
    return [{ type: "text", text: prompt }];
  }
  return prompt as Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }>;
}

/**
 * Reads all user messages for a turn and merges their prompts into a single
 * PromptContent value.
 */
export const readMergedPrompt = (sessionId: string, turnId: string) =>
  Effect.gen(function* () {
    const result = yield* claudeMessageSqliteEntity
      .query("byTurn", { pk: { turnId }, sk: { ">": null } })
      .pipe(Effect.orDie);

    const userMessages = result.items
      .filter(
        (m) => (m.value.data as any).type === "user",
      )
      .map((m) => (m.value.data as any).message.content as typeof PromptContent.Type);

    if (userMessages.length === 0) {
      return "" as typeof PromptContent.Type;
    }
    if (userMessages.length === 1) {
      return userMessages[0]!;
    }

    const blocks = userMessages.flatMap(promptToBlocks);
    return blocks as typeof PromptContent.Type;
  });
