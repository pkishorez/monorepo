import { Effect } from "effect";
import { ulid } from "ulid";
import {
  codexEventSqliteEntity,
  codexThreadSqliteEntity,
  codexTurnSqliteEntity,
} from "../../db/codex.js";
import type { TaskStatus } from "../../entity/status.js";
import type { PromptContent } from "../shared/schema.js";


export const markTurnStatus = (
  turnId: string,
  threadId: string,
  status: TaskStatus,
) =>
  Effect.all(
    [
      codexTurnSqliteEntity
        .update({ id: turnId }, { status })
        .pipe(Effect.orDie),
      codexThreadSqliteEntity
        .update({ threadId }, { status })
        .pipe(Effect.orDie),
    ],
    { discard: true },
  );

const markTurnsInterrupted = (threadId: string) =>
  codexTurnSqliteEntity
    .query("byThread", {
      pk: { threadId },
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

export const initThreads = Effect.gen(function* () {
  const { items: inProgressThreads } = yield* codexThreadSqliteEntity
    .query("byStatus", { pk: { status: "in_progress" }, sk: { ">": null } })
    .pipe(Effect.orDie);

  yield* Effect.forEach(
    inProgressThreads,
    ({ value }) =>
      Effect.all(
        [
          codexThreadSqliteEntity
            .update({ threadId: value.threadId }, { status: "interrupted" })
            .pipe(Effect.orDie),
          markTurnsInterrupted(value.threadId),
        ],
        { discard: true },
      ),
    { discard: true },
  );
});

export const persistNewTurn = (
  threadId: string,
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
    codexThreadSqliteEntity.update({ threadId }, { status: "in_progress" }),
    codexTurnSqliteEntity.insert({
      id: turnId,
      threadId,
      model,
      status: "in_progress",
      sdkTurnId: null,
      usage: null,
      error: null,
    }),
    codexEventSqliteEntity.insert({
      id: ulid(),
      threadId,
      turnId,
      data: {
        method: "item/started",
        params: {
          threadId,
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
