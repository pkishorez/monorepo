import { Effect } from "effect";
import { turnSqliteEntity } from "../../db/turn.js";
import { sessionSqliteEntity } from "../../db/session.js";
import type {
  TurnPayload,
  ClaudeTurnPayload,
  CodexTurnPayload,
} from "../../entity/turn/index.js";
import type { TaskStatus } from "../../entity/status.js";

export const markTurnStatus = (
  turnId: string,
  sessionId: string,
  status: TaskStatus,
) =>
  Effect.all(
    [
      turnSqliteEntity
        .update({ id: turnId }, { status })
        .pipe(Effect.orDie),
      sessionSqliteEntity.update({ sessionId }, { status }).pipe(Effect.orDie),
    ],
    { discard: true },
  );

export const markTurnsInterrupted = (sessionId: string) =>
  turnSqliteEntity
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
              turnSqliteEntity
                .update({ id: t.value.id }, { status: "interrupted" })
                .pipe(Effect.orDie),
            ),
          { discard: true },
        ),
      ),
      Effect.orDie,
    );

export const updateTurnPayload = (
  turnId: string,
  updater: (payload: typeof TurnPayload.Type) => typeof TurnPayload.Type,
) =>
  Effect.gen(function* () {
    const row = yield* turnSqliteEntity.get({ id: turnId }).pipe(Effect.orDie);
    if (!row) {
      yield* Effect.logWarning("updateTurnPayload: turn not found").pipe(
        Effect.annotateLogs({ turnId }),
      );
      return;
    }
    yield* turnSqliteEntity
      .update({ id: turnId }, { payload: updater(row.value.payload) })
      .pipe(Effect.orDie);
  });

export const updateClaudeTurnPayload = (
  turnId: string,
  updater: (
    payload: typeof ClaudeTurnPayload.Type,
  ) => typeof ClaudeTurnPayload.Type,
) =>
  updateTurnPayload(turnId, (payload) =>
    payload.type === "claude" ? updater(payload) : payload,
  );

export const updateCodexTurnPayload = (
  turnId: string,
  updater: (
    payload: typeof CodexTurnPayload.Type,
  ) => typeof CodexTurnPayload.Type,
) =>
  updateTurnPayload(turnId, (payload) =>
    payload.type === "codex" ? updater(payload) : payload,
  );
