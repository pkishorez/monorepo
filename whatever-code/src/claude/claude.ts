import { Effect, Queue } from "effect";
import {
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../db/claude.js";
import type { ActiveTurn } from "./schema.js";
import { recoverInterruptedSessions } from "./internal/recover-interrupted.js";
import { continueSession } from "./internal/continue-session.js";
import { makeModelOperations } from "./internal/models.js";

const shutdownFinalizer = (activeTurns: Map<string, ActiveTurn>) =>
  Effect.addFinalizer(() =>
    Effect.forEach(
      activeTurns.entries(),
      ([sessionId, turn]) =>
        Effect.all(
          [
            claudeTurnSqliteEntity
              .update({ id: turn.turnId }, { status: "interrupted" })
              .pipe(Effect.orDie),
            claudeSessionSqliteEntity
              .update({ id: sessionId }, { status: "interrupted" })
              .pipe(Effect.orDie),
          ],
          { discard: true },
        ).pipe(
          Effect.ensuring(Effect.sync(() => turn.abortController.abort())),
        ),
      { discard: true },
    ),
  );

const stopSession =
  (activeTurns: Map<string, ActiveTurn>) => (sessionId: string) =>
    Effect.gen(function* () {
      const turn = activeTurns.get(sessionId);
      if (!turn) return;

      activeTurns.delete(sessionId);
      yield* Effect.all(
        [
          claudeTurnSqliteEntity
            .update({ id: turn.turnId }, { status: "interrupted" })
            .pipe(Effect.orDie),
          claudeSessionSqliteEntity
            .update({ id: sessionId }, { status: "interrupted" })
            .pipe(Effect.orDie),
        ],
        { discard: true },
      );
      turn.abortController.abort();
      yield* Queue.shutdown(turn.outputQueue);
    });

const getSessionStatus =
  (activeTurns: Map<string, ActiveTurn>) => (sessionId: string) =>
    Effect.gen(function* () {
      const session = yield* claudeSessionSqliteEntity
        .get({ id: sessionId })
        .pipe(Effect.orDie);

      const { items: turns } = yield* claudeTurnSqliteEntity
        .query("bySession", { pk: { sessionId }, sk: { ">": null } })
        .pipe(Effect.orDie);

      const latestTurn = turns.at(-1) ?? null;

      const active = activeTurns.get(sessionId);
      if (!active) {
        return {
          session,
          latestTurn,
          isActiveInMemory: false,
          activeQueues: null,
        };
      }

      const outputQueueIsShutdown = yield* Queue.isShutdown(active.outputQueue);
      return {
        session,
        latestTurn,
        isActiveInMemory: true,
        activeQueues: { outputQueueIsShutdown },
      };
    });

export class ClaudeOrchestrator extends Effect.Service<ClaudeOrchestrator>()(
  "ClaudeOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const activeTurns = new Map<string, ActiveTurn>();
      const { updateModel, updateMode, getModels } = makeModelOperations();

      yield* recoverInterruptedSessions;
      yield* shutdownFinalizer(activeTurns);

      return {
        continueSession: continueSession(activeTurns),
        stopSession: stopSession(activeTurns),
        getSessionStatus: getSessionStatus(activeTurns),
        updateModel,
        updateMode,
        getModels,
      };
    }),
  },
) {}
