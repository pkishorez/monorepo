import { execFile } from "node:child_process";
import { Effect, Runtime, Schema } from "effect";
import { v7 } from "uuid";
import { ulid } from "ulid";
import { CodexClient } from "./client.js";
import { CodexChatError } from "../../api/definitions/codex.js";
import { execCodexJson } from "./exec-json.js";
import { codexEventSqliteEntity } from "../../db/entities/codex.js";
import { sessionSqliteEntity } from "../../db/entities/session.js";
import { updateSessionPayload } from "../shared/session.js";
import { updateCodexTurnPayload } from "../shared/turn.js";
import { deriveSessionName } from "../shared/session-name.js";
import type { ActiveTurn } from "./internal.js";
import {
  CreateThreadParams,
  ContinueThreadParams,
  UpdateThreadParams,
  RespondToUserInputParams,
} from "./schema.js";
import {
  markTurnStatus,
  persistNewTurn,
  persistQueuedTurn,
  appendToQueuedTurn,
  findQueuedTurn,
  readMergedPrompt,
  initSessions,
  isStreamEvent,
  toUserInputQuestions,
  toCodexUserInputAnswers,
  extractAnswersFromInput,
} from "./utils.js";
import type { ServerNotification } from "./generated/ServerNotification.js";
import type { ThreadStartResponse } from "./generated/v2/ThreadStartResponse.js";
import type { TurnStartResponse } from "./generated/v2/TurnStartResponse.js";
import type { UserInput } from "./generated/v2/UserInput.js";
import { errorMessage } from "../../lib/error.js";
import type { PromptContent } from "../shared/schema.js";

function promptToCodexInput(
  prompt: typeof PromptContent.Type,
): UserInput[] {
  if (typeof prompt === "string") {
    return [{ type: "text", text: prompt, text_elements: [] }];
  }
  const inputs: UserInput[] = [];
  for (const block of prompt) {
    if (block.type === "text") {
      inputs.push({ type: "text", text: block.text, text_elements: [] });
    } else if (block.type === "image") {
      inputs.push({
        type: "image",
        url: `data:${block.source.media_type};base64,${block.source.data}`,
      });
    }
  }
  return inputs.length > 0
    ? inputs
    : [{ type: "text", text: "", text_elements: [] }];
}

export class CodexOrchestrator extends Effect.Service<CodexOrchestrator>()(
  "CodexOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const client = yield* CodexClient;
      const runtime = yield* Effect.runtime<never>();
      const fork = <A, E>(effect: Effect.Effect<A, E, any>) =>
        Runtime.runFork(runtime)(effect as Effect.Effect<A, E, never>);
      const activeTurns = new Map<string, ActiveTurn>();

      /** Respond with empty answers to all pending user-input requests
       *  so the subprocess doesn't hang, then clear the map. */
      const drainPendingUserInputs = (turn: ActiveTurn) => {
        for (const [, pending] of turn.pendingUserInputs) {
          client.respond(pending.jsonRpcId, { answers: {} });
        }
        turn.pendingUserInputs.clear();
      };

      yield* initSessions;

      yield* Effect.addFinalizer(() =>
        Effect.forEach(
          activeTurns.entries(),
          ([sessionId, turn]) => {
            drainPendingUserInputs(turn);
            return markTurnStatus(turn.turnId, sessionId, "interrupted");
          },
          { discard: true },
        ),
      );

      const handleNotification = (notification: ServerNotification) => {
        const effect = Effect.gen(function* () {
          yield* Effect.logDebug("codex: notification received").pipe(
            Effect.annotateLogs({ method: notification.method }),
          );
          switch (notification.method) {
            case "turn/started": {
              const { threadId, turn } = notification.params;
              const activeTurn = findActiveTurnBySdkThreadId(threadId);
              if (activeTurn) {
                yield* updateCodexTurnPayload(activeTurn.turn.turnId, (payload) => ({
                  ...payload,
                  sdkTurnId: turn.id,
                }));
                activeTurn.turn.sdkTurnId = turn.id;
              }
              break;
            }
            case "turn/completed": {
              const { threadId: sdkThreadId, turn } = notification.params;
              const activeTurn = findActiveTurnBySdkThreadId(sdkThreadId);
              if (!activeTurn) break;
              const { ourSessionId, turn: at } = activeTurn;

              if (turn.status === "completed") {
                yield* markTurnStatus(at.turnId, ourSessionId, "success");
              } else if (turn.status === "failed") {
                yield* Effect.logError("codex: turn failed").pipe(
                  Effect.annotateLogs({
                    sessionId: ourSessionId,
                    turnId: at.turnId,
                    errorMessage: turn.error?.message ?? "unknown",
                    errorInfo: turn.error?.codexErrorInfo ?? "none",
                    additionalDetails: turn.error?.additionalDetails ?? "none",
                  }),
                );
                yield* updateCodexTurnPayload(at.turnId, (payload) => ({
                  ...payload,
                  error: turn.error,
                }));
                yield* markTurnStatus(at.turnId, ourSessionId, "error");
              } else if (turn.status === "interrupted") {
                yield* markTurnStatus(at.turnId, ourSessionId, "interrupted");
              }

              activeTurns.delete(ourSessionId);

              // Auto-drain: on success, execute queued turn if present
              if (turn.status === "completed") {
                yield* drainQueuedTurn(ourSessionId);
              }
              break;
            }
            case "thread/name/updated": {
              const { threadId: sdkThreadId } = notification.params;
              const activeTurn = findActiveTurnBySdkThreadId(sdkThreadId);
              if (activeTurn) {
                const name = notification.params.threadName;
                if (name) {
                  yield* sessionSqliteEntity
                    .update(
                      { sessionId: activeTurn.ourSessionId },
                      { name },
                    )
                    .pipe(Effect.orDie);
                }
              }
              break;
            }
            case "thread/tokenUsage/updated": {
              const { threadId: sdkThreadId, tokenUsage } =
                notification.params;
              const activeTurn = findActiveTurnBySdkThreadId(sdkThreadId);
              if (activeTurn) {
                yield* updateCodexTurnPayload(activeTurn.turn.turnId, (payload) => ({
                  ...payload,
                  usage: tokenUsage,
                }));
              }
              break;
            }
            case "item/started":
            case "item/completed": {
              // Skip SDK's userMessage events — we already persist the user message in persistNewTurn
              if (notification.params.item.type === "userMessage") break;

              const activeTurn = findActiveTurnBySdkThreadId(notification.params.threadId);
              if (activeTurn) {
                yield* codexEventSqliteEntity
                  .insert({
                    id: ulid(),
                    sessionId: activeTurn.ourSessionId,
                    turnId: activeTurn.turn.turnId,
                    data: notification,
                  })
                  .pipe(Effect.orDie);
              }
              break;
            }
            default: {
              if (isStreamEvent(notification.method)) break;

              const sdkThreadId = extractThreadId(notification);
              if (sdkThreadId) {
                const activeTurn = findActiveTurnBySdkThreadId(sdkThreadId);
                if (activeTurn) {
                  yield* codexEventSqliteEntity
                    .insert({
                      id: ulid(),
                      sessionId: activeTurn.ourSessionId,
                      turnId: activeTurn.turn.turnId,
                      data: notification,
                    })
                    .pipe(Effect.orDie);
                }
              }
              break;
            }
          }
        }).pipe(
          Effect.tapError((e) =>
            Effect.logError("codex: handleNotification failed").pipe(
              Effect.annotateLogs({
                method: notification.method,
                error: String(e),
              }),
            ),
          ),
          Effect.catchAll(() => Effect.void),
        );
        fork(effect);
      };

      client.onNotification(handleNotification);

      // ── Handle server requests (user-input questions) ──
      client.onServerRequest((jsonRpcId, request) => {
        if (request.method !== "item/tool/requestUserInput") return;

        const params = request.params;
        const effect = Effect.gen(function* () {
          const activeTurn = findActiveTurnBySdkThreadId(params.threadId);
          if (!activeTurn) {
            client.respond(jsonRpcId, { answers: {} });
            return;
          }

          const { turn } = activeTurn;
          const { questions, codexQuestionIds } = toUserInputQuestions(params.questions);

          if (questions.length === 0) {
            // All questions failed validation — respond with empty answers
            client.respond(jsonRpcId, { answers: {} });
            return;
          }

          // requestId doubles as the codex-event entity ID so the frontend
          // can correlate the persisted event with the pending question entry.
          const requestId = ulid();

          // Store in memory for later lookup
          turn.pendingUserInputs.set(requestId, {
            jsonRpcId,
            codexQuestionIds,
            questions,
          });

          // Persist a synthetic event so the frontend can place the question
          // in the natural transcript order instead of appending it later.
          yield* codexEventSqliteEntity.insert({
            id: requestId,
            sessionId: activeTurn.ourSessionId,
            turnId: turn.turnId,
            data: {
              method: "item/tool/requestUserInput",
              params: {
                threadId: params.threadId,
                turnId: params.turnId,
                itemId: params.itemId,
                questions,
              },
            },
          });

          // Persist to DB so frontend discovers it
          yield* updateCodexTurnPayload(turn.turnId, (payload) => ({
            ...payload,
            pendingQuestions: {
              ...payload.pendingQuestions,
              [requestId]: {
                status: "pending" as const,
                question: { questions },
              },
            },
          }));
        }).pipe(
          // If DB persistence fails, clean up in-memory state and unblock
          // the subprocess so it doesn't hang indefinitely.
          Effect.tapError((e) =>
            Effect.logError("codex: onServerRequest handler failed, responding with empty answers").pipe(
              Effect.annotateLogs({ error: String(e) }),
            ),
          ),
          Effect.catchAll(() =>
            Effect.sync(() => {
              client.respond(jsonRpcId, { answers: {} });
            }),
          ),
        );
        fork(effect);
      });

      const sdkThreadIdMap = new Map<string, string>();

      const findActiveTurnBySdkThreadId = (sdkThreadId: string) => {
        const ourSessionId = sdkThreadIdMap.get(sdkThreadId);
        if (!ourSessionId) return null;
        const turn = activeTurns.get(ourSessionId);
        if (!turn) return null;
        return { ourSessionId, turn };
      };

      const drainQueuedTurn = (sessionId: string) =>
        Effect.gen(function* () {
          const queued = yield* findQueuedTurn(sessionId);
          if (!queued) return;
          // prompt is re-read inside continueThread via readMergedPrompt when existingTurnId is set
          yield* continueThread(
            { sessionId, prompt: "" } as typeof ContinueThreadParams.Type,
            queued.id,
          );
        }).pipe(
          Effect.tapError((e) =>
            Effect.logWarning("drainQueuedTurn failed").pipe(
              Effect.annotateLogs({ sessionId, error: String(e) }),
            ),
          ),
          Effect.catchAll(() => Effect.void),
        );

      const createThread = (params: typeof CreateThreadParams.Type) =>
        Effect.gen(function* () {
          const sessionId = v7();

          yield* sessionSqliteEntity
            .insert({
              sessionId,
              type: "codex",
              status: "in_progress",
              absolutePath: params.absolutePath,
              name: deriveSessionName(params.prompt),
              model: params.model,
              interactionMode: params.interactionMode ?? "default",
              payload: {
                type: "codex",
                accessMode: "full-access",
                sdkThreadId: null,
              },
            })
            .pipe(Effect.orDie);

          fork(
            Effect.gen(function* () {
              const response = (yield* client.request("thread/start", {
                model: params.model,
                cwd: params.absolutePath,
                approvalPolicy: "never",
                sandbox: "danger-full-access",
                experimentalRawEvents: false,
                persistExtendedHistory: false,
              })) as ThreadStartResponse;

              const sdkThreadId = response.thread.id;
              yield* sessionSqliteEntity
                .update(
                  { sessionId },
                  {
                    payload: {
                      type: "codex",
                      accessMode: "full-access",
                      sdkThreadId,
                    },
                  },
                )
                .pipe(Effect.orDie);
              sdkThreadIdMap.set(sdkThreadId, sessionId);

              yield* continueThread({ sessionId, prompt: params.prompt });
            }).pipe(
              Effect.tapError((e) =>
                Effect.logError("codex: createThread background task failed").pipe(
                  Effect.annotateLogs({ sessionId, error: String(e) }),
                ),
              ),
              Effect.catchAll(() =>
                sessionSqliteEntity
                  .update({ sessionId }, { status: "error" })
                  .pipe(Effect.orDie, Effect.asVoid),
              ),
            ),
          );
          return sessionId;
        }).pipe(
          Effect.mapError((e) => new CodexChatError({ message: errorMessage(e) })),
        );

      const continueThread = (
        params: typeof ContinueThreadParams.Type,
        existingTurnId?: string,
      ) =>
        Effect.gen(function* () {
          const { sessionId } = params;

          // ── Guard: if a turn is still running, queue or append ──
          const existing = activeTurns.get(sessionId);
          if (existing) {
            const queued = yield* findQueuedTurn(sessionId);
            if (queued) {
              yield* appendToQueuedTurn(sessionId, queued.id, params.prompt);
            } else {
              const session = yield* sessionSqliteEntity
                .get({ sessionId })
                .pipe(
                  Effect.orDie,
                  Effect.flatMap((row) =>
                    row && row.value.payload.type === "codex"
                      ? Effect.succeed(row.value as typeof row.value & { payload: { type: "codex" } })
                      : Effect.fail(
                          new CodexChatError({
                            message: `codex session ${sessionId} not found`,
                          }),
                        ),
                  ),
                );
              yield* persistQueuedTurn(
                sessionId,
                ulid(),
                params.prompt,
                session.model,
              );
            }
            return;
          }

          const session = yield* sessionSqliteEntity
            .get({ sessionId })
            .pipe(
              Effect.orDie,
              Effect.flatMap((row) =>
                row && row.value.payload.type === "codex"
                  ? Effect.succeed(row.value as typeof row.value & { payload: { type: "codex" } })
                  : Effect.fail(
                      new CodexChatError({
                        message: `codex session ${sessionId} not found`,
                      }),
                    ),
              ),
            );

          const { payload } = session;
          if (!payload.sdkThreadId) {
            return yield* Effect.fail(
              new CodexChatError({
                message: `session ${sessionId} has no SDK thread ID`,
              }),
            );
          }

          // ── Resolve which turn to execute ──
          let turnId: string;
          let sdkPrompt: typeof PromptContent.Type;

          if (existingTurnId) {
            // Drain path
            turnId = existingTurnId;
            sdkPrompt = yield* readMergedPrompt(sessionId, turnId);
            yield* markTurnStatus(turnId, sessionId, "in_progress");
          } else {
            // Check for existing queued turn
            const queued = yield* findQueuedTurn(sessionId);
            if (queued) {
              turnId = queued.id;
              yield* appendToQueuedTurn(sessionId, turnId, params.prompt);
              sdkPrompt = yield* readMergedPrompt(sessionId, turnId);
              yield* markTurnStatus(turnId, sessionId, "in_progress");
            } else {
              // Fresh turn
              turnId = ulid();
              sdkPrompt = params.prompt;
              yield* persistNewTurn(sessionId, turnId, params.prompt, session.model);
            }
          }

          const turn: ActiveTurn = { turnId, sdkTurnId: null, pendingUserInputs: new Map() };
          activeTurns.set(sessionId, turn);

          if (!sdkThreadIdMap.has(payload.sdkThreadId)) {
            yield* client.request("thread/resume", {
              threadId: payload.sdkThreadId,
              persistExtendedHistory: false,
            });
            sdkThreadIdMap.set(payload.sdkThreadId, sessionId);
          }

          const response = (yield* client.request("turn/start", {
            threadId: payload.sdkThreadId,
            input: promptToCodexInput(sdkPrompt),
            model: session.model,
            approvalPolicy: "never",
            sandboxPolicy: { type: "dangerFullAccess" },
            collaborationMode: {
              mode: session.interactionMode === "plan" ? "plan" : "default",
              settings: {
                model: session.model,
                reasoning_effort: null,
                developer_instructions: null,
              },
            },
          })) as TurnStartResponse;

          turn.sdkTurnId = response.turn.id;
          yield* updateCodexTurnPayload(turnId, (payload) => ({
            ...payload,
            sdkTurnId: response.turn.id,
          }));
        }).pipe(
          Effect.tapError((e) =>
            Effect.gen(function* () {
              yield* Effect.logError("codex: continueThread failed").pipe(
                Effect.annotateLogs({
                  sessionId: params.sessionId,
                  error: String(e),
                }),
              );
              const turn = activeTurns.get(params.sessionId);
              if (turn) {
                activeTurns.delete(params.sessionId);
                yield* markTurnStatus(turn.turnId, params.sessionId, "error");
              }
            }),
          ),
          Effect.mapError((e) =>
            e instanceof CodexChatError
              ? e
              : new CodexChatError({ message: errorMessage(e) }),
          ),
        );

      const stopThread = (sessionId: string) =>
        Effect.gen(function* () {
          const turn = activeTurns.get(sessionId);
          if (!turn) return;

          drainPendingUserInputs(turn);

          const row = yield* sessionSqliteEntity
            .get({ sessionId })
            .pipe(Effect.orDie);
          if (!row || row.value.payload.type !== "codex" || !row.value.payload.sdkThreadId) return;

          if (turn.sdkTurnId) {
            yield* client
              .request("turn/interrupt", {
                threadId: row.value.payload.sdkThreadId,
                turnId: turn.sdkTurnId,
              })
              .pipe(Effect.catchAll(() => Effect.void));
          }

          activeTurns.delete(sessionId);
          yield* markTurnStatus(turn.turnId, sessionId, "interrupted");
        });

      const updateThread = (params: typeof UpdateThreadParams.Type) =>
        updateSessionPayload(params.sessionId, "codex", params.updates);

      const respondToUserInput = (
        params: typeof RespondToUserInputParams.Type,
      ) =>
        Effect.gen(function* () {
          const { sessionId, requestId, response } = params;
          const turn = activeTurns.get(sessionId);
          if (!turn) {
            return yield* Effect.fail(
              new CodexChatError({ message: "No active turn for this session" }),
            );
          }

          const pending = turn.pendingUserInputs.get(requestId);
          if (!pending) {
            return yield* Effect.fail(
              new CodexChatError({
                message: `Unknown pending user input: ${requestId}`,
              }),
            );
          }

          // Persist "answered" state to DB — use in-memory questions as the
          // source of truth rather than re-reading from the DB payload.
          yield* updateCodexTurnPayload(turn.turnId, (payload) => ({
            ...payload,
            pendingQuestions: {
              ...payload.pendingQuestions,
              [requestId]: {
                status: "answered" as const,
                question: { questions: [...pending.questions] },
                response:
                  response.behavior === "allow"
                    ? (response.updatedInput ?? {})
                    : { denied: true, message: response.message },
              },
            },
          }));

          // Convert answers and send JSON-RPC response back to subprocess
          if (response.behavior === "allow") {
            const answers = extractAnswersFromInput(response.updatedInput);
            const codexAnswers = toCodexUserInputAnswers(
              answers,
              pending.codexQuestionIds,
              pending.questions,
            );
            client.respond(pending.jsonRpcId, { answers: codexAnswers });
          } else {
            // Denied — respond with empty answers
            client.respond(pending.jsonRpcId, { answers: {} });
          }

          turn.pendingUserInputs.delete(requestId);
        }).pipe(
          Effect.mapError((e) =>
            e instanceof CodexChatError
              ? e
              : new CodexChatError({ message: errorMessage(e) }),
          ),
        );

      const oneShot = (params: {
        cwd: string;
        prompt: string;
        model?: string;
      }) =>
        Effect.tryPromise({
          try: async () => {
            const args = [
              "exec",
              "--ephemeral",
              "-s",
              "read-only",
              "--config",
              'model_reasoning_effort="low"',
              "-C",
              params.cwd,
              ...(params.model ? ["-m", params.model] : []),
              "-",
            ];
            const stdout = await new Promise<string>((resolve, reject) => {
              const child = execFile(
                "codex",
                args,
                { timeout: 60_000, maxBuffer: 1024 * 1024, env: { ...process.env } },
                (error, out) => {
                  if (error) return reject(error);
                  resolve(String(out));
                },
              );
              child.stdin?.end(params.prompt);
            });
            return stdout.trim();
          },
          catch: (e) =>
            new CodexChatError({
              message: e instanceof Error ? e.message : String(e),
            }),
        });

      const oneShotJson = <A, I, R>(params: {
        cwd: string;
        prompt: string;
        schema: Schema.Schema<A, I, R>;
        model?: string;
      }) => execCodexJson(params);

      return {
        createThread,
        continueThread,
        stopThread,
        updateThread,
        respondToUserInput,
        oneShot,
        oneShotJson,
      };
    }),
  },
) {}

function extractThreadId(notification: ServerNotification): string | null {
  const params = notification.params as { threadId?: string };
  return params.threadId ?? null;
}
