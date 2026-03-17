import {
  query,
  type Options as QueryOptions,
} from "@anthropic-ai/claude-agent-sdk";
import { Cause, Effect, Exit, Queue, Stream } from "effect";
import { ulid } from "ulid";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../../db/claude.js";
import type { ActiveSession } from "../schema.js";

export const startBackgroundFiber = (
  activeSessions: Map<string, ActiveSession>,
  sessionId: string,
  session: ActiveSession,
  queryOptions?: QueryOptions,
) => {
  const queryResult = query({
    prompt: Stream.toAsyncIterable(Stream.fromQueue(session.inputQueue)),
    options: {
      ...queryOptions,
      abortController: session.abortController,
    },
  });
  session.query = queryResult;

  const processMessage = (message: (typeof queryResult) extends AsyncGenerator<infer T> ? T : never) =>
    Effect.gen(function* () {
      const turnId = session.turnId;
      session.lastActivityAt = Date.now();

      yield* claudeMessageSqliteEntity
        .insert({ id: ulid(), sessionId, turnId, data: message })
        .pipe(Effect.orDie);

      yield* Queue.offer(session.outputQueue, message);

      if (message.type === "system" && message.subtype === "init") {
        yield* Effect.log("session initialized").pipe(
          Effect.annotateLogs({ turnId }),
        );
        yield* claudeTurnSqliteEntity
          .update({ id: turnId }, { init: message })
          .pipe(Effect.orDie);
      } else if (message.type === "result") {
        const status = message.is_error ? "error" : "success";
        yield* Effect.log("turn completed").pipe(
          Effect.annotateLogs({ turnId, status }),
        );
        yield* claudeTurnSqliteEntity
          .update({ id: turnId }, { status, result: message })
          .pipe(Effect.orDie);
        yield* claudeSessionSqliteEntity
          .update({ id: sessionId }, { status })
          .pipe(Effect.orDie);
        yield* Queue.shutdown(session.outputQueue);
      }
    });

  return Effect.forkScoped(
    Stream.fromAsyncIterable(
      queryResult,
      (e) => new Error(String(e)),
    ).pipe(
      Stream.tap(processMessage),
      Stream.runDrain,
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          yield* Queue.shutdown(session.outputQueue);

          if (!activeSessions.has(sessionId)) return;
          activeSessions.delete(sessionId);

          if (Exit.isSuccess(exit)) {
            yield* Effect.log("background fiber exited cleanly");
            return;
          }

          if (Exit.isInterrupted(exit)) {
            yield* Effect.log("background fiber interrupted");
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
            return;
          }

          const cause = exit.pipe(Exit.causeOption);
          yield* Effect.logError("background fiber failed").pipe(
            Effect.annotateLogs({
              cause: cause._tag === "Some" ? Cause.pretty(cause.value) : "unknown",
            }),
          );
          yield* Effect.all(
            [
              claudeTurnSqliteEntity
                .update({ id: session.turnId }, { status: "error" })
                .pipe(Effect.orDie),
              claudeSessionSqliteEntity
                .update({ id: sessionId }, { status: "error" })
                .pipe(Effect.orDie),
            ],
            { discard: true },
          );
        }),
      ),
      Effect.withSpan("claude.backgroundFiber", {
        attributes: { sessionId },
      }),
    ),
  );
};
