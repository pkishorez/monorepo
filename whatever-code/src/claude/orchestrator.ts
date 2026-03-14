import {
  query,
  type Options as QueryOptions,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect, Queue, Stream } from "effect";
import { v7 } from "uuid";
import { ulid } from "ulid";
import { ClaudeChatError } from "../api/definitions/claude.js";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../db/claude.js";
import { ContinueSessionParams, QueryParams } from "./schema.js";

interface ActiveSession {
  abortController: AbortController;
  inputQueue: Queue.Queue<SDKUserMessage>;
  outputQueue: Queue.Queue<SDKMessage>;
  turnId: string;
}

const makeUserMessage = (
  sessionId: string,
  prompt: string,
): SDKUserMessage => ({
  type: "user",
  message: { role: "user", content: prompt },
  parent_tool_use_id: null,
  session_id: sessionId,
});

export class ClaudeOrchestrator extends Effect.Service<ClaudeOrchestrator>()(
  "ClaudeOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const activeSessions = new Map<string, ActiveSession>();

      // Bootstrap: mark all in_progress sessions and their turns as interrupted
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

      const startBackgroundFiber = (
        sessionId: string,
        session: ActiveSession,
        options?: QueryOptions,
      ) => {
        const queryResult = query({
          prompt: Stream.toAsyncIterable(Stream.fromQueue(session.inputQueue)),
          options: {
            ...options,
            sessionId,
            abortController: session.abortController,
          },
        });

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
                  const result = message;
                  const status = result.is_error ? "error" : "success";
                  yield* claudeTurnSqliteEntity
                    .update({ id: turnId }, { status, result })
                    .pipe(Effect.orDie);
                  yield* claudeSessionSqliteEntity
                    .update({ id: sessionId }, { status })
                    .pipe(Effect.orDie);
                }
              }),
            ),
            Effect.catchAll(() =>
              activeSessions.has(sessionId)
                ? Effect.all(
                    [
                      claudeTurnSqliteEntity
                        .update({ id: session.turnId }, { status: "error" })
                        .pipe(Effect.orDie),
                      claudeSessionSqliteEntity
                        .update({ id: sessionId }, { status: "error" })
                        .pipe(Effect.orDie),
                    ],
                    { discard: true },
                  )
                : Effect.void,
            ),
            Effect.ensuring(
              Effect.gen(function* () {
                yield* Queue.shutdown(session.outputQueue);
                activeSessions.delete(sessionId);
              }),
            ),
          ),
        );
      };

      const startNewSession = (
        sessionId: string,
        turnId: string,
        userMessage: SDKUserMessage,
        options?: QueryOptions,
      ) =>
        Effect.gen(function* () {
          const inputQueue = yield* Queue.unbounded<SDKUserMessage>();
          const outputQueue = yield* Queue.unbounded<SDKMessage>();
          const session: ActiveSession = {
            abortController: new AbortController(),
            inputQueue,
            outputQueue,
            turnId,
          };
          activeSessions.set(sessionId, session);
          yield* Queue.offer(inputQueue, userMessage);
          yield* startBackgroundFiber(sessionId, session, options);
          return Stream.fromQueue(outputQueue);
        });

      const createSession = (params: typeof QueryParams.Type) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const sessionId = v7();
            const turnId = ulid();
            const userMessage = makeUserMessage(sessionId, params.prompt);

            yield* Effect.all([
              claudeSessionSqliteEntity.insert({
                id: sessionId,
                status: "in_progress",
              }),
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
                data: userMessage,
              }),
            ]).pipe(Effect.orDie);

            return yield* startNewSession(
              sessionId,
              turnId,
              userMessage,
              params.options,
            );
          }),
        );

      const persistNewTurn = (
        sessionId: string,
        turnId: string,
        userMessage: SDKUserMessage,
      ) =>
        Effect.all([
          claudeSessionSqliteEntity.update(
            { id: sessionId },
            { status: "in_progress" },
          ),
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
            data: userMessage,
          }),
        ]).pipe(Effect.orDie);

      const continueSession = (params: typeof ContinueSessionParams.Type) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const userMessage = makeUserMessage(
              params.sessionId,
              params.prompt,
            );
            const existing = activeSessions.get(params.sessionId);
            const turnId = ulid();

            if (existing) {
              if (!(yield* Queue.isShutdown(existing.outputQueue))) {
                return yield* Effect.fail(
                  new ClaudeChatError({
                    message: "previous turn did not finish yet",
                  }),
                );
              }

              const newTurnQueue = yield* Queue.unbounded<SDKMessage>();

              yield* persistNewTurn(params.sessionId, turnId, userMessage);

              existing.turnId = turnId;
              existing.outputQueue = newTurnQueue;

              yield* Queue.offer(existing.inputQueue, userMessage);
              return Stream.fromQueue(newTurnQueue);
            }

            // Inactive session — resume
            yield* persistNewTurn(params.sessionId, turnId, userMessage);

            return yield* startNewSession(
              params.sessionId,
              turnId,
              userMessage,
              params.options,
            );
          }),
        );

      const stopSession = (sessionId: string) =>
        Effect.gen(function* () {
          const session = activeSessions.get(sessionId);
          if (session) {
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
          }
        });

      return { createSession, continueSession, stopSession };
    }),
  },
) {}
