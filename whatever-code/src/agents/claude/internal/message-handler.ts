import { getSessionInfo, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Cause, Deferred, Effect, Exit, Queue } from "effect";
import { ulid } from "ulid";
import {
  claudeMessageSqliteEntity,
  claudeTurnSqliteEntity,
} from "../../../db/claude.js";
import { sessionSqliteEntity } from "../../../db/session.js";
import { markTurnStatus } from "../utils.js";
import type { ActiveTurn } from "./types.js";

/** Persists each SDK message to DB and routes init/result events. */
export const processMessage = (
  sessionId: string,
  turn: ActiveTurn,
) =>
  (message: SDKMessage) =>
    Effect.gen(function* () {
      yield* claudeMessageSqliteEntity
        .insert({
          id: ulid(),
          sessionId,
          turnId: turn.turnId,
          data: message,
        })
        .pipe(Effect.orDie);
      yield* Queue.offer(turn.outputQueue, message);

      if (message.type === "system" && message.subtype === "init") {
        yield* Effect.log("session initialized").pipe(
          Effect.annotateLogs({ turnId: turn.turnId }),
        );
        yield* claudeTurnSqliteEntity
          .update({ id: turn.turnId }, { init: message })
          .pipe(Effect.orDie);
        yield* Deferred.succeed(turn.initialized, void 0);
      } else if (message.type === "result") {
        const status = message.is_error ? "error" : "success";

        yield* Effect.log("turn completed").pipe(
          Effect.annotateLogs({ turnId: turn.turnId, status }),
        );

        yield* claudeTurnSqliteEntity
          .update({ id: turn.turnId }, { status, result: message })
          .pipe(Effect.orDie);
        yield* sessionSqliteEntity
          .update({ sessionId }, { status })
          .pipe(Effect.orDie);

        yield* Effect.tryPromise(() => getSessionInfo(sessionId)).pipe(
          Effect.flatMap((info) => {
            if (!info?.summary) return Effect.void;
            return sessionSqliteEntity
              .update({ sessionId }, { name: info.summary })
              .pipe(Effect.orDie, Effect.asVoid);
          }),
          Effect.catchAll(() => Effect.void),
        );

        yield* Queue.shutdown(turn.outputQueue);
      }
    });

/** Handles fiber exit — cleans up turn state and marks status. */
export const onFiberExit = (
  sessionId: string,
  turn: ActiveTurn,
) =>
  (exit: Exit.Exit<void, Error>) =>
    Effect.gen(function* () {
      yield* Queue.shutdown(turn.outputQueue);

      if (Exit.isSuccess(exit)) {
        yield* Deferred.succeed(turn.initialized, void 0);
        yield* Effect.log("background fiber exited cleanly");
      } else if (Exit.isInterrupted(exit)) {
        yield* Deferred.fail(
          turn.initialized,
          new Error("session interrupted before init"),
        );
        yield* Effect.log("background fiber interrupted");
        yield* markTurnStatus(turn.turnId, sessionId, "interrupted");
      } else {
        const cause = exit.pipe(Exit.causeOption);
        const errorMsg =
          cause._tag === "Some" ? Cause.pretty(cause.value) : "unknown";
        yield* Deferred.fail(turn.initialized, new Error(errorMsg));
        yield* Effect.logError("background fiber failed").pipe(
          Effect.annotateLogs({ cause: errorMsg }),
        );
        yield* markTurnStatus(turn.turnId, sessionId, "error");
      }
    });
