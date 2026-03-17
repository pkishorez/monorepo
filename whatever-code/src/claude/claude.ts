import { Effect, Queue } from "effect";
import {
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../db/claude.js";
import type { ActiveSession } from "./schema.js";
import { recoverInterruptedSessions } from "./internal/recover-interrupted.js";
import { initSession } from "./internal/init-session.js";
import { createSession } from "./internal/create-session.js";
import { continueSession } from "./internal/continue-session.js";
import { makeModelOperations } from "./internal/models.js";

const shutdownFinalizer = (activeSessions: Map<string, ActiveSession>) =>
  Effect.addFinalizer(() =>
    Effect.forEach(
      activeSessions.entries(),
      ([sessionId, session]) =>
        Effect.all(
          [
            claudeTurnSqliteEntity
              .update({ id: session.turnId }, { status: "interrupted" })
              .pipe(Effect.orDie),
            claudeSessionSqliteEntity
              .update({ id: sessionId }, { status: "interrupted" })
              .pipe(Effect.orDie),
          ],
          { discard: true },
        ).pipe(
          Effect.ensuring(
            Effect.sync(() => session.abortController.abort()),
          ),
        ),
      { discard: true },
    ),
  );

const stopSession = (activeSessions: Map<string, ActiveSession>) =>
  (sessionId: string) =>
    Effect.gen(function* () {
      const session = activeSessions.get(sessionId);
      if (!session) return;

      activeSessions.delete(sessionId);
      yield* Effect.all(
        [
          claudeTurnSqliteEntity
            .update({ id: session.turnId }, { status: "interrupted" })
            .pipe(Effect.orDie),
          claudeSessionSqliteEntity
            .update({ id: sessionId }, { status: "interrupted" })
            .pipe(Effect.orDie),
        ],
        { discard: true },
      );
      session.abortController.abort();
      yield* Queue.shutdown(session.inputQueue);
      yield* Queue.shutdown(session.outputQueue);
    });

const getSessionStatus = (activeSessions: Map<string, ActiveSession>) =>
  (sessionId: string) =>
    Effect.gen(function* () {
      const session = yield* claudeSessionSqliteEntity
        .get({ id: sessionId })
        .pipe(Effect.orDie);

      const { items: turns } = yield* claudeTurnSqliteEntity
        .query("bySession", { pk: { sessionId }, sk: { ">": null } })
        .pipe(Effect.orDie);

      const latestTurn = turns.at(-1) ?? null;

      const active = activeSessions.get(sessionId);
      if (!active) {
        return {
          session,
          latestTurn,
          isActiveInMemory: false,
          activeQueues: null,
        };
      }

      const inputQueueSize = yield* Queue.size(active.inputQueue);
      const outputQueueIsShutdown = yield* Queue.isShutdown(
        active.outputQueue,
      );
      return {
        session,
        latestTurn,
        isActiveInMemory: true,
        activeQueues: { inputQueueSize, outputQueueIsShutdown },
      };
    });

export class ClaudeOrchestrator extends Effect.Service<ClaudeOrchestrator>()(
  "ClaudeOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const activeSessions = new Map<string, ActiveSession>();
      const init = initSession(activeSessions);
      const { updateModel, getModels } = makeModelOperations(activeSessions);

      yield* recoverInterruptedSessions;
      yield* shutdownFinalizer(activeSessions);

      return {
        createSession: createSession(init),
        continueSession: continueSession(activeSessions, init),
        stopSession: stopSession(activeSessions),
        getSessionStatus: getSessionStatus(activeSessions),
        updateModel,
        getModels,
      };
    }),
  },
) {}
