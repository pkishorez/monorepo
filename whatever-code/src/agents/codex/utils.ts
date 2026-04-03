import { Effect } from "effect";
import { ulid } from "ulid";
import {
  codexEventSqliteEntity,
  codexTurnSqliteEntity,
} from "../../db/codex.js";
import { sessionSqliteEntity } from "../../db/session.js";
import { initSessionsForType } from "../shared/session.js";
import type { TaskStatus } from "../../entity/status.js";
import type { PromptContent } from "../shared/schema.js";


export const markTurnStatus = (
  turnId: string,
  sessionId: string,
  status: TaskStatus,
) =>
  Effect.all(
    [
      codexTurnSqliteEntity
        .update({ id: turnId }, { status })
        .pipe(Effect.orDie),
      sessionSqliteEntity
        .update({ sessionId }, { status })
        .pipe(Effect.orDie),
    ],
    { discard: true },
  );

const markTurnsInterrupted = (sessionId: string) =>
  codexTurnSqliteEntity
    .query("bySession", {
      pk: { sessionId },
      sk: { ">": null },
    })
    .pipe(
      Effect.flatMap(({ items }) =>
        Effect.all(
          items
            .filter((t) => t.value.status === "in_progress")
            .map((t) =>
              codexTurnSqliteEntity
                .update({ id: t.value.id }, { status: "interrupted" })
                .pipe(Effect.orDie),
            ),
          { discard: true },
        ),
      ),
      Effect.orDie,
    );

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
    codexTurnSqliteEntity.insert({
      id: turnId,
      sessionId,
      model,
      status: "in_progress",
      sdkTurnId: null,
      usage: null,
      error: null,
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
