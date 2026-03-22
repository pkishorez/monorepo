import { Effect } from "effect";
import { ulid } from "ulid";
import {
  codexEventSqliteEntity,
  codexThreadSqliteEntity,
  codexTurnSqliteEntity,
} from "../db/codex.js";
import { projectSqliteEntity } from "../db/claude.js";

export const MODELS = [
  {
    value: "o3",
    displayName: "o3",
    description: "Most capable reasoning model",
  },
  {
    value: "o4-mini",
    displayName: "o4-mini",
    description: "Fast and efficient reasoning model",
  },
  {
    value: "codex-mini-latest",
    displayName: "Codex Mini",
    description: "Optimized for code tasks",
  },
];

export const updateProjectStatus = (
  threadId: string,
  status: "idle" | "active" | "error",
) =>
  projectSqliteEntity
    .query("byUpdatedAt", { pk: {}, sk: { ">": null } })
    .pipe(
      Effect.flatMap(({ items }) => {
        const project = items.find(
          (p) =>
            p.value.agent.type === "codex" &&
            p.value.agent.threadId === threadId,
        );
        if (!project) return Effect.void;
        return projectSqliteEntity
          .update({ id: project.value.id }, { status })
          .pipe(Effect.asVoid);
      }),
      Effect.orDie,
    );

export const markTurnStatus = (
  turnId: string,
  threadId: string,
  status: "interrupted" | "error" | "success",
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
  prompt: string,
) =>
  Effect.all([
    codexThreadSqliteEntity.update({ threadId }, { status: "in_progress" }),
    codexTurnSqliteEntity.insert({
      id: turnId,
      threadId,
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
            content: [{ type: "text", text: prompt, text_elements: [] }],
          },
        },
      },
    }),
  ]).pipe(Effect.orDie);
