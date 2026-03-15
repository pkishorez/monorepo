import {
  query,
  type Options as QueryOptions,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect, Exit, Queue, Stream } from "effect";
import { ulid } from "ulid";
import { ClaudeChatError } from "../../api/definitions/claude.js";
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

  return Effect.forkScoped(
    Stream.fromAsyncIterable(
      queryResult,
      (e) => new ClaudeChatError({ message: String(e) }),
    ).pipe(
      Stream.runForEach((message) =>
        Effect.gen(function* () {
          const turnId = session.turnId;

          yield* claudeMessageSqliteEntity
            .insert({ id: ulid(), sessionId, turnId, data: message })
            .pipe(Effect.orDie);

          yield* Queue.offer(session.outputQueue, message);

          if (message.type === "system" && message.subtype === "init") {
            yield* claudeTurnSqliteEntity
              .update({ id: turnId }, { init: message })
              .pipe(Effect.orDie);
          } else if (message.type === "result") {
            const status = message.is_error ? "error" : "success";
            yield* claudeTurnSqliteEntity
              .update({ id: turnId }, { status, result: message })
              .pipe(Effect.orDie);
            yield* claudeSessionSqliteEntity
              .update({ id: sessionId }, { status })
              .pipe(Effect.orDie);
            yield* Queue.shutdown(session.outputQueue);
          }
        }),
      ),
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          yield* Queue.shutdown(session.outputQueue);

          if (!activeSessions.has(sessionId)) return;
          activeSessions.delete(sessionId);

          if (Exit.isSuccess(exit)) return;

          const status = Exit.isInterrupted(exit) ? "interrupted" : "error";
          yield* Effect.all(
            [
              claudeTurnSqliteEntity
                .update({ id: session.turnId }, { status })
                .pipe(Effect.orDie),
              claudeSessionSqliteEntity
                .update({ id: sessionId }, { status })
                .pipe(Effect.orDie),
            ],
            { discard: true },
          );
        }),
      ),
      Effect.catchAll(() => Effect.void),
    ),
  );
};
