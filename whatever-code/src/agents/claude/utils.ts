import { Effect } from "effect";
import { ulid } from "ulid";
import {
  claudeMessageSqliteEntity,
  claudeTurnSqliteEntity,
} from "../../db/claude.js";
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
      claudeTurnSqliteEntity
        .update({ id: turnId }, {
          status,
          pendingQuestion: null,
          pendingToolApprovals: [],
        })
        .pipe(Effect.orDie),
      sessionSqliteEntity.update({ sessionId }, { status }).pipe(Effect.orDie),
    ],
    { discard: true },
  );

export const initSessions = initSessionsForType("claude", (sessionId: string) =>
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
                .update({ id: t.value.id }, {
                  status: "interrupted",
                  pendingQuestion: null,
                  pendingToolApprovals: [],
                })
                .pipe(Effect.orDie),
            ),
          { discard: true },
        ),
      ),
      Effect.orDie,
    ),
);

export const persistNewTurn = (
  sessionId: string,
  turnId: string,
  prompt: typeof PromptContent.Type,
) =>
  Effect.all([
    sessionSqliteEntity.update({ sessionId }, { status: "in_progress" }),
    claudeTurnSqliteEntity.insert({
      id: turnId,
      sessionId,
      status: "in_progress",
      init: null,
      result: null,
      planArtifact: null,
      pendingQuestion: null,
      pendingToolApprovals: [],
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
