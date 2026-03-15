import {
  query as sdkQuery,
  type ModelInfo,
  type Options as QueryOptions,
  type SDKMessage,
  type SDKUserMessage,
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
  UpdateModelParams,
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
            ...(queryOptions?.model !== undefined ? { model: queryOptions.model } : {}),
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
              name: params.prompt.slice(0, 80),
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
          const dbSession = yield* claudeSessionSqliteEntity
            .get({ id: params.sessionId })
            .pipe(Effect.orDie);
          const storedModel = dbSession?.value.model;
          yield* initSession(params.sessionId, turnId, userMessage, {
            ...(storedModel !== undefined ? { model: storedModel } : {}),
            ...params.options,
            resume: params.sessionId,
          });
        });

      const getSessionStatus = (sessionId: string) =>
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
            return { session, latestTurn, isActiveInMemory: false, activeQueues: null };
          }

          const inputQueueSize = yield* Queue.size(active.inputQueue);
          const outputQueueIsShutdown = yield* Queue.isShutdown(active.outputQueue);
          return {
            session,
            latestTurn,
            isActiveInMemory: true,
            activeQueues: { inputQueueSize, outputQueueIsShutdown },
          };
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

      const updateModel = (params: typeof UpdateModelParams.Type) =>
        Effect.gen(function* () {
          yield* claudeSessionSqliteEntity
            .update({ id: params.sessionId }, { model: params.model })
            .pipe(Effect.orDie);
          const existing = activeSessions.get(params.sessionId);
          if (existing) {
            existing.model = params.model;
            if (existing.query) {
              yield* Effect.tryPromise({
                try: () => existing.query!.setModel(params.model),
                catch: (e) => new ClaudeChatError({ message: String(e) }),
              });
            }
          }
        });

      let cachedModels: ModelInfo[] | undefined;

      const fetchModels = () => {
        const activeQuery = [...activeSessions.values()].find((s) => s.query)?.query;
        if (activeQuery) return activeQuery.supportedModels();
        const ac = new AbortController();
        async function* emptyPrompt() {}
        const tempQuery = sdkQuery({ prompt: emptyPrompt(), options: { abortController: ac } });
        return tempQuery.supportedModels().finally(() => ac.abort());
      };

      const getModels = () =>
        Effect.gen(function* () {
          if (cachedModels) return cachedModels;
          const models = yield* Effect.tryPromise({
            try: () => fetchModels(),
            catch: (e) => new ClaudeChatError({ message: String(e) }),
          });
          cachedModels = models;
          return models;
        });

      return { createSession, continueSession, stopSession, getSessionStatus, updateModel, getModels };
    }),
  },
) {}
