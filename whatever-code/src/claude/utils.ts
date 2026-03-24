import { Effect } from "effect";
import { ulid } from "ulid";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../db/claude.js";
import type { TaskStatus } from "../entity/status.js";


export const markTurnStatus = (
  turnId: string,
  sessionId: string,
  status: TaskStatus,
) =>
  Effect.all(
    [
      claudeTurnSqliteEntity
        .update({ id: turnId }, { status })
        .pipe(Effect.orDie),
      claudeSessionSqliteEntity
        .update({ sessionId }, { status })
        .pipe(Effect.orDie),
    ],
    { discard: true },
  );

const markTurnsInterrupted = (sessionId: string) =>
  claudeTurnSqliteEntity
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
              claudeTurnSqliteEntity
                .update({ id: t.value.id }, { status: "interrupted" })
                .pipe(Effect.orDie),
            ),
          { discard: true },
        ),
      ),
      Effect.orDie,
    );

export const initSessions = Effect.gen(function* () {
  const { items: inProgressSessions } = yield* claudeSessionSqliteEntity
    .query("byStatus", { pk: { status: "in_progress" }, sk: { ">": null } })
    .pipe(Effect.orDie);

  yield* Effect.forEach(
    inProgressSessions,
    ({ value }) =>
      Effect.all(
        [
          claudeSessionSqliteEntity
            .update({ sessionId: value.sessionId }, { status: "interrupted" })
            .pipe(Effect.orDie),
          markTurnsInterrupted(value.sessionId),
        ],
        { discard: true },
      ),
    { discard: true },
  );
});

export const persistNewTurn = (
  sessionId: string,
  turnId: string,
  prompt: string,
) =>
  Effect.all([
    claudeSessionSqliteEntity.update({ sessionId }, { status: "in_progress" }),
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
