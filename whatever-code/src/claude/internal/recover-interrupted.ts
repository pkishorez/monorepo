import { Effect } from "effect";
import {
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../../db/claude.js";

/** Mark all in_progress sessions and their turns as interrupted on startup. */
export const recoverInterruptedSessions = Effect.gen(function* () {
  const { items: inProgressSessions } = yield* claudeSessionSqliteEntity
    .query("byStatus", { pk: { status: "in_progress" }, sk: { ">": null } })
    .pipe(Effect.orDie);

  yield* Effect.all(
    inProgressSessions.map(({ value }) =>
      claudeSessionSqliteEntity
        .update({ id: value.id }, { status: "interrupted" })
        .pipe(Effect.orDie),
    ),
    { discard: true },
  );

  yield* Effect.all(
    inProgressSessions.map(({ value }) =>
      claudeTurnSqliteEntity
        .query("bySession", {
          pk: { sessionId: value.id },
          sk: { ">": null },
        })
        .pipe(
          Effect.flatMap(({ items }) =>
            Effect.all(
              items
                .filter(({ value: turn }) => turn.status === "in_progress")
                .map(({ value: turn }) =>
                  claudeTurnSqliteEntity
                    .update({ id: turn.id }, { status: "interrupted" })
                    .pipe(Effect.orDie),
                ),
              { discard: true },
            ),
          ),
          Effect.orDie,
        ),
    ),
    { discard: true },
  );
});
