import {
  query,
  type Query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect, Queue, Stream } from "effect";
import { v7 } from "uuid";
import { ulid } from "ulid";
import { ClaudeChatError } from "../api/definitions/claude.js";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
} from "../db/claude.js";

interface ActiveSession {
  abortController: AbortController;
  queue: Queue.Queue<SDKUserMessage>;
  result: Query;
}

export class ClaudeOrchestrator extends Effect.Service<ClaudeOrchestrator>()(
  "ClaudeOrchestrator",
  {
    effect: Effect.gen(function* () {
      const activeSessions = new Map<string, ActiveSession>();

      const chat = (params: { prompt: string; sessionId?: string }) =>
        Stream.unwrapScoped(
          Effect.gen(function* () {
            const sessionId = params.sessionId ?? v7();
            const abortController = new AbortController();
            const queue = yield* Queue.unbounded<SDKUserMessage>();

            const userMessage = {
              type: "user",
              message: { role: "user", content: params.prompt },
              parent_tool_use_id: null,
              session_id: sessionId,
            } satisfies SDKUserMessage;

            yield* Effect.all([
              claudeSessionSqliteEntity.insert({ id: sessionId, result: null }),
              claudeMessageSqliteEntity.insert({
                id: ulid(),
                sessionId,
                data: userMessage,
              }),
            ]).pipe(Effect.orDie);
            yield* Queue.offer(queue, userMessage);

            const asyncIterable = Stream.toAsyncIterable(
              Stream.fromQueue(queue),
            );

            const result = query({
              prompt: asyncIterable,
              options: { sessionId, abortController },
            });

            activeSessions.set(sessionId, { abortController, queue, result });

            return Stream.fromAsyncIterable(
              result,
              (error) => new ClaudeChatError({ message: String(error) }),
            ).pipe(
              Stream.tap(
                Effect.fn(function* (message) {
                  yield* claudeMessageSqliteEntity
                    .insert({ id: ulid(), sessionId, data: message })
                    .pipe(Effect.orDie);

                  if (message.type === "result") {
                    yield* claudeSessionSqliteEntity
                      .update({ id: sessionId }, { result: message })
                      .pipe(Effect.orDie);
                  }
                }),
              ),
              Stream.ensuring(
                Effect.gen(function* () {
                  const session = activeSessions.get(sessionId);
                  if (session) {
                    session.abortController.abort();
                    yield* Queue.shutdown(session.queue);
                    activeSessions.delete(sessionId);
                  }
                }),
              ),
            );
          }),
        );

      const sendMessage = (sessionId: string, message: SDKUserMessage) =>
        Effect.gen(function* () {
          const session = activeSessions.get(sessionId);
          if (session) {
            yield* Queue.offer(session.queue, message);
          }
        });

      /** Interrupts the current processing turn, keeping the session alive for further messages. */
      const interrupt = (sessionId: string) =>
        Effect.tryPromise({
          try: async () => {
            const session = activeSessions.get(sessionId);
            if (session) await session.result.interrupt();
          },
          catch: (error) => new ClaudeChatError({ message: String(error) }),
        });

      /** Fully stops the session and cleans up all resources. */
      const stop = (sessionId: string) =>
        Effect.gen(function* () {
          const session = activeSessions.get(sessionId);
          if (session) {
            session.abortController.abort();
            yield* Queue.shutdown(session.queue);
            activeSessions.delete(sessionId);
          }
        });

      return { chat, interrupt, sendMessage, stop };
    }),
  },
) {}
