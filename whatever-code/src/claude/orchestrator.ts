import type {
  Options as QueryOptions,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect, Queue } from "effect";
import { v7 } from "uuid";
import { ulid } from "ulid";
import { ClaudeChatError } from "../api/definitions/claude.js";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../db/claude.js";
import {
  ContinueSessionParams,
  QueryParams,
  type ActiveSession,
} from "./schema.js";
import { recoverInterruptedSessions } from "./internal/recover-interrupted.js";
import { startBackgroundFiber } from "./internal/background-fiber.js";

const makeUserMessage = (
  sessionId: string,
  prompt: string,
): SDKUserMessage => ({
  type: "user",
  message: { role: "user", content: prompt },
  parent_tool_use_id: null,
  session_id: sessionId,
});

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

export class ClaudeOrchestrator extends Effect.Service<ClaudeOrchestrator>()(
  "ClaudeOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const activeSessions = new Map<string, ActiveSession>();

      yield* recoverInterruptedSessions;

      yield* Effect.addFinalizer(() =>
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

      const initSession = (
        sessionId: string,
        turnId: string,
        userMessage: SDKUserMessage,
        queryOptions?: QueryOptions,
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
          yield* startBackgroundFiber(
            activeSessions,
            sessionId,
            session,
            queryOptions,
          );
        });

      const createSession = (params: typeof QueryParams.Type) =>
        Effect.gen(function* () {
          const sessionId = v7();
          const turnId = ulid();
          const userMessage = makeUserMessage(sessionId, params.prompt);

          yield* Effect.all([
            claudeSessionSqliteEntity.insert({
              id: sessionId,
              status: "in_progress",
              absolutePath: params.cwd,
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

          yield* initSession(sessionId, turnId, userMessage, {
            ...params.options,
            sessionId,
          });
          return { sessionId };
        });

      const continueSession = (params: typeof ContinueSessionParams.Type) =>
        Effect.gen(function* () {
          const userMessage = makeUserMessage(params.sessionId, params.prompt);
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

            yield* persistNewTurn(params.sessionId, turnId, userMessage);
            existing.turnId = turnId;
            existing.outputQueue = yield* Queue.unbounded<SDKMessage>();
            yield* Queue.offer(existing.inputQueue, userMessage);
            return;
          }

          yield* persistNewTurn(params.sessionId, turnId, userMessage);
          yield* initSession(params.sessionId, turnId, userMessage, {
            ...params.options,
            resume: params.sessionId,
          });
        });

      const stopSession = (sessionId: string) =>
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

      return { createSession, continueSession, stopSession };
    }),
  },
) {}
