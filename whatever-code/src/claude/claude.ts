import {
  type Options as QueryOptions,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { Deferred, Effect, Queue } from "effect";
import { v7 } from "uuid";
import { ulid } from "ulid";
import { ClaudeChatError } from "../api/definitions/claude.js";
import {
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
  projectSqliteEntity,
} from "../db/claude.js";
import type { ActiveTurn } from "./schema.js";
import {
  ContinueSessionParams,
  CreateSessionParams,
  RespondToToolParams,
  UpdateSessionParams,
} from "./schema.js";
import { runQuery } from "./run-query.js";
import {
  MODELS,
  markTurnStatus,
  persistNewTurn,
  recoverInterruptedSessions,
  rejectPendingTools,
  type SessionCapabilities,
} from "./utils.js";

const gracefulShutdown = (activeTurns: Map<string, ActiveTurn>) =>
  Effect.forEach(
    activeTurns.entries(),
    ([sessionId, turn]) =>
      markTurnStatus(turn.turnId, sessionId, "interrupted").pipe(
        Effect.ensuring(
          rejectPendingTools(turn, "Shutdown").pipe(
            Effect.andThen(
              Effect.sync(() => turn.abortController.abort()),
            ),
          ),
        ),
      ),
    { discard: true },
  );

const guardPreviousTurn = (
  activeTurns: Map<string, ActiveTurn>,
  sessionId: string,
) =>
  Effect.gen(function* () {
    const existing = activeTurns.get(sessionId);
    if (!existing) return;

    const isOutputDone = yield* Queue.isShutdown(existing.outputQueue);
    if (!isOutputDone) {
      yield* Effect.logWarning(
        "rejecting continue — previous turn still active",
      );
      return yield* Effect.fail(
        new ClaudeChatError({ message: "previous turn did not finish yet" }),
      );
    }
    activeTurns.delete(sessionId);
  });

const createActiveTurn = (turnId: string) =>
  Effect.map(Queue.unbounded<SDKMessage>(), (outputQueue): ActiveTurn => ({
    abortController: new AbortController(),
    outputQueue,
    turnId,
    pendingTools: new Map(),
  }));

const buildQueryOptions = (
  userOptions: QueryOptions | undefined,
  db: {
    storedModel: string | undefined;
    storedPermissionMode: string | undefined;
    sdkCreated: boolean;
    absolutePath: string | undefined;
  },
  sessionId: string,
) => {
  const base: QueryOptions = {
    ...userOptions,
    ...(db.storedModel !== undefined ? { model: db.storedModel } : {}),
    ...(db.absolutePath !== undefined ? { cwd: db.absolutePath } : {}),
  };
  if (db.sdkCreated) base.resume = sessionId;
  else base.sessionId = sessionId;
  if (db.storedPermissionMode !== undefined)
    (base as Record<string, unknown>).permissionMode =
      db.storedPermissionMode;
  return base;
};

const insertNewSession = (
  sessionId: string,
  params: typeof CreateSessionParams.Type,
) =>
  claudeSessionSqliteEntity
    .insert({
      id: sessionId,
      status: "success",
      sdkSessionCreated: false,
      absolutePath: params.absolutePath,
      name: "New Session",
      ...(params.model !== undefined ? { model: params.model } : {}),
      ...(params.permissionMode !== undefined
        ? { permissionMode: params.permissionMode }
        : {}),
    })
    .pipe(Effect.orDie);

const linkProjectToSession = (absolutePath: string, sessionId: string) =>
  projectSqliteEntity
    .update({ id: absolutePath }, { sessionId, status: "idle" })
    .pipe(Effect.orDie);

const loadSessionFromDb = (sessionId: string) =>
  claudeSessionSqliteEntity.get({ id: sessionId }).pipe(Effect.orDie);

export class ClaudeOrchestrator extends Effect.Service<ClaudeOrchestrator>()(
  "ClaudeOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const activeTurns = new Map<string, ActiveTurn>();
      const runtime = yield* Effect.runtime<never>();

      yield* recoverInterruptedSessions;
      yield* Effect.addFinalizer(() => gracefulShutdown(activeTurns));

      const createSession = (params: typeof CreateSessionParams.Type) =>
        Effect.gen(function* () {
          const sessionId = v7();
          yield* insertNewSession(sessionId, params);
          yield* linkProjectToSession(params.absolutePath, sessionId);
          yield* continueSession({ sessionId, prompt: params.prompt });
        }).pipe(
          Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
        );

      const continueSession = (params: typeof ContinueSessionParams.Type) =>
        Effect.gen(function* () {
          if (!params.sessionId) {
            return yield* Effect.fail(
              new ClaudeChatError({
                message: "sessionId is required to continue a session",
              }),
            );
          }

          yield* guardPreviousTurn(activeTurns, params.sessionId);

          const turnId = ulid();
          yield* persistNewTurn(params.sessionId, turnId, params.prompt);

          const dbSession = yield* loadSessionFromDb(params.sessionId);

          const turn = yield* createActiveTurn(turnId);
          activeTurns.set(params.sessionId, turn);

          const options = buildQueryOptions(
            params.options,
            {
              storedModel: dbSession?.value.model,
              storedPermissionMode: dbSession?.value.permissionMode,
              sdkCreated: dbSession?.value.sdkSessionCreated ?? false,
              absolutePath: dbSession?.value.absolutePath,
            },
            params.sessionId,
          );

          yield* runQuery({
            runtime,
            activeTurns,
            sessionId: params.sessionId,
            turn,
            prompt: params.prompt,
            queryOptions: options,
          });
        }).pipe(
          Effect.withSpan("claude.continueSession", {
            attributes: { sessionId: params.sessionId },
          }),
        );

      const stopSession = (sessionId: string) =>
        Effect.gen(function* () {
          const turn = activeTurns.get(sessionId);
          if (!turn) return;

          activeTurns.delete(sessionId);
          yield* rejectPendingTools(turn, "Session stopped");
          yield* markTurnStatus(turn.turnId, sessionId, "interrupted");
          turn.abortController.abort();
          yield* Queue.shutdown(turn.outputQueue);
        });

      const respondToTool = (params: typeof RespondToToolParams.Type) =>
        Effect.gen(function* () {
          const turn = activeTurns.get(params.sessionId);
          if (!turn) {
            return yield* Effect.logWarning(
              "respondToTool: no active turn for session",
            );
          }

          const deferred = turn.pendingTools.get(params.toolUseId);
          if (!deferred) {
            return yield* Effect.logWarning(
              "respondToTool: no pending tool for toolUseId",
            );
          }

          turn.pendingTools.delete(params.toolUseId);
          yield* Deferred.succeed(deferred, params.response);
          yield* Effect.log("respondToTool: resolved pending tool");
        });

      const updateSession = (params: typeof UpdateSessionParams.Type) =>
        claudeSessionSqliteEntity
          .update({ id: params.sessionId }, params.updates)
          .pipe(Effect.orDie);

      const getSessionStatus = (sessionId: string) =>
        Effect.gen(function* () {
          const session = yield* loadSessionFromDb(sessionId);
          const { items: turns } = yield* claudeTurnSqliteEntity
            .query("bySession", {
              pk: { sessionId },
              sk: { ">": null },
            })
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

          const outputQueueIsShutdown = yield* Queue.isShutdown(
            active.outputQueue,
          );
          return {
            session,
            latestTurn,
            isActiveInMemory: true,
            activeQueues: { outputQueueIsShutdown },
          };
        });

      const getCapabilities = (_absolutePath: string) =>
        Effect.succeed<SessionCapabilities>({ models: MODELS, commands: [] });

      return {
        createSession,
        continueSession,
        stopSession,
        respondToTool,
        updateSession,
        getSessionStatus,
        getCapabilities,
      };
    }),
  },
) {}
