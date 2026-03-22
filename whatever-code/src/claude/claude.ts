import {
  query,
  getSessionInfo,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { Cause, Effect, Exit, Queue, Stream } from "effect";
import { v7 } from "uuid";
import { ulid } from "ulid";
import { ClaudeChatError } from "../api/definitions/claude.js";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
  projectSqliteEntity,
} from "../db/claude.js";
import type { ActiveTurn } from "./schema.js";
import {
  ContinueSessionParams,
  CreateSessionParams,
  UpdateSessionParams,
} from "./schema.js";
import {
  markTurnStatus,
  persistNewTurn,
  initSessions,
  updateProjectStatus,
} from "./utils.js";

export class ClaudeOrchestrator extends Effect.Service<ClaudeOrchestrator>()(
  "ClaudeOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const activeTurns = new Map<string, ActiveTurn>();

      yield* initSessions;
      yield* Effect.addFinalizer(() =>
        ((activeTurns: Map<string, ActiveTurn>) =>
          Effect.forEach(
            activeTurns.entries(),
            ([sessionId, turn]) =>
              markTurnStatus(turn.turnId, sessionId, "interrupted"),
            { discard: true },
          ))(activeTurns),
      );

      const createSession = (params: typeof CreateSessionParams.Type) =>
        Effect.gen(function* () {
          const sessionId = v7();
          yield* claudeSessionSqliteEntity
            .insert({
              sessionId,
              status: "success",
              absolutePath: params.absolutePath,
              name: "New Session",
              model: params.model,
              permissionMode: params.permissionMode,
              persistSession: params.persistSession,
              effort: params.effort,
              maxTurns: params.maxTurns,
              maxBudgetUsd: params.maxBudgetUsd,
            })
            .pipe(Effect.orDie);
          yield* projectSqliteEntity
            .update(
              { id: params.absolutePath },
              { agent: { type: "claude", sessionId }, status: "idle" },
            )
            .pipe(Effect.orDie);
          yield* continueSession({ sessionId, prompt: params.prompt }, true);
        }).pipe(
          Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
        );

      const continueSession = (
        params: typeof ContinueSessionParams.Type,
        newSession = false,
      ) =>
        Effect.gen(function* () {
          const sessionId = params.sessionId;

          const existing = activeTurns.get(sessionId);
          if (existing) {
            const isOutputDone = yield* Queue.isShutdown(existing.outputQueue);
            if (!isOutputDone) {
              yield* Effect.logWarning(
                "rejecting continue — previous turn still active",
              );
              return yield* Effect.fail(
                new ClaudeChatError({
                  message: "previous turn did not finish yet",
                }),
              );
            }
            activeTurns.delete(sessionId);
          }

          const session = yield* claudeSessionSqliteEntity
            .get({ sessionId })
            .pipe(
              Effect.orDie,
              Effect.flatMap((row) =>
                row
                  ? Effect.succeed(row.value)
                  : Effect.fail(
                      new ClaudeChatError({
                        message: `session ${sessionId} not found`,
                      }),
                    ),
              ),
            );

          const turnId = ulid();
          yield* persistNewTurn(sessionId, turnId, params.prompt);

          const turn = yield* Effect.map(
            Queue.unbounded<SDKMessage>(),
            (outputQueue): ActiveTurn => ({
              abortController: new AbortController(),
              outputQueue,
              turnId,
            }),
          );
          activeTurns.set(sessionId, turn);

          const queryResult = query({
            prompt: params.prompt,
            options: {
              model: session.model,
              cwd: session.absolutePath,
              ...(newSession ? { sessionId } : { resume: sessionId }),
              permissionMode: session.permissionMode,
              persistSession: session.persistSession,
              effort: session.effort,
              ...(session.maxTurns > 0 ? { maxTurns: session.maxTurns } : {}),
              ...(session.maxBudgetUsd > 0
                ? { maxBudgetUsd: session.maxBudgetUsd }
                : {}),
              ...(session.permissionMode === "bypassPermissions"
                ? { allowDangerouslySkipPermissions: true }
                : {}),
              abortController: turn.abortController,
              toolConfig: {
                askUserQuestion: { previewFormat: "html" },
              },
              sandbox: {
                enabled: true,
                autoAllowBashIfSandboxed: true,
              },
            },
          });

          type Message =
            typeof queryResult extends AsyncGenerator<infer T> ? T : never;

          const processMessage = (message: Message) =>
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
                yield* Effect.all(
                  [
                    claudeTurnSqliteEntity
                      .update({ id: turn.turnId }, { init: message })
                      .pipe(Effect.orDie),
                    updateProjectStatus(sessionId, "active"),
                  ],
                  { discard: true },
                );
              } else if (message.type === "result") {
                const status = message.is_error ? "error" : "success";

                yield* Effect.log("turn completed").pipe(
                  Effect.annotateLogs({ turnId: turn.turnId, status }),
                );

                yield* claudeTurnSqliteEntity
                  .update({ id: turn.turnId }, { status, result: message })
                  .pipe(Effect.orDie);
                yield* claudeSessionSqliteEntity
                  .update({ sessionId }, { status })
                  .pipe(Effect.orDie);

                yield* Effect.all(
                  [
                    Effect.tryPromise(() => getSessionInfo(sessionId)).pipe(
                      Effect.flatMap((info) => {
                        if (!info?.summary) return Effect.void;
                        return claudeSessionSqliteEntity
                          .update({ sessionId }, { name: info.summary })
                          .pipe(Effect.orDie, Effect.asVoid);
                      }),
                      Effect.catchAll(() => Effect.void),
                    ),
                    updateProjectStatus(
                      sessionId,
                      status === "error" ? "error" : "idle",
                    ),
                  ],
                  { discard: true },
                );

                yield* Queue.shutdown(turn.outputQueue);
              }
            });

          const onFiberExit = (exit: Exit.Exit<void, Error>) =>
            Effect.gen(function* () {
              yield* Queue.shutdown(turn.outputQueue);

              if (!activeTurns.has(sessionId)) return;
              activeTurns.delete(sessionId);

              if (Exit.isSuccess(exit)) {
                yield* Effect.log("background fiber exited cleanly");
              } else if (Exit.isInterrupted(exit)) {
                yield* Effect.log("background fiber interrupted");
                yield* markTurnStatus(turn.turnId, sessionId, "interrupted");
                yield* updateProjectStatus(sessionId, "idle");
              } else {
                const cause = exit.pipe(Exit.causeOption);
                yield* Effect.logError("background fiber failed").pipe(
                  Effect.annotateLogs({
                    cause:
                      cause._tag === "Some"
                        ? Cause.pretty(cause.value)
                        : "unknown",
                  }),
                );
                yield* markTurnStatus(turn.turnId, sessionId, "error");
                yield* updateProjectStatus(sessionId, "error");
              }
            });

          yield* Effect.forkScoped(
            Stream.fromAsyncIterable(
              queryResult,
              (e) => new Error(String(e)),
            ).pipe(
              Stream.tap(processMessage),
              Stream.runDrain,
              Effect.onExit(onFiberExit),
              Effect.withSpan("claude.backgroundFiber", {
                attributes: { sessionId },
              }),
            ),
          );
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
          yield* markTurnStatus(turn.turnId, sessionId, "interrupted");
          turn.abortController.abort();
          yield* Queue.shutdown(turn.outputQueue);
        });

      const updateSession = (params: typeof UpdateSessionParams.Type) =>
        claudeSessionSqliteEntity
          .update({ sessionId: params.sessionId }, params.updates)
          .pipe(Effect.orDie);

      return {
        createSession,
        continueSession,
        stopSession,
        updateSession,
      };
    }),
  },
) {}
