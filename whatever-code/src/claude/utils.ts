import { Effect } from "effect";
import { ulid } from "ulid";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
  projectSqliteEntity,
} from "../db/claude.js";

export interface SessionCapabilities {
  models: { value: string; displayName: string; description: string }[];
  commands: { name: string; description: string; argumentHint: string }[];
}

export const MODELS: SessionCapabilities["models"] = [
  {
    value: "claude-opus-4-6",
    displayName: "Opus 4.6",
    description: "Most capable model for complex tasks",
  },
  {
    value: "claude-sonnet-4-6",
    displayName: "Sonnet 4.6",
    description: "Best balance of speed and capability",
  },
  {
    value: "claude-haiku-4-5-20251001",
    displayName: "Haiku 4.5",
    description: "Fastest model for simple tasks",
  },
];

export const updateProjectStatus = (
  id: string,
  status: "idle" | "active" | "error",
) =>
  projectSqliteEntity
    .query("bySessionId", { pk: { id }, sk: { ">": null } })
    .pipe(
      Effect.flatMap(({ items }) => {
        const project = items[0];
        if (!project) return Effect.void;
        return projectSqliteEntity
          .update({ id: project.value.id }, { status })
          .pipe(Effect.asVoid);
      }),
      Effect.orDie,
    );

export const markTurnStatus = (
  turnId: string,
  sessionId: string,
  status: "interrupted" | "error",
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
