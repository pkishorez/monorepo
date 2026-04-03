import { execFile } from "node:child_process";
import { Effect, Runtime, Schema } from "effect";
import { v7 } from "uuid";
import { ulid } from "ulid";
import { CodexClient } from "./client.js";
import { CodexChatError } from "../../api/definitions/codex.js";
import { execCodexJson } from "./exec-json.js";
import { codexEventSqliteEntity } from "../../db/codex.js";
import { sessionSqliteEntity } from "../../db/session.js";
import { updateSessionPayload } from "../shared/session.js";
import { updateCodexTurnPayload } from "../shared/turn.js";
import { deriveSessionName } from "../shared/session-name.js";
import type { ActiveTurn } from "./internal.js";
import {
  CreateThreadParams,
  ContinueThreadParams,
  UpdateThreadParams,
  RespondToApprovalParams,
} from "./schema.js";
import {
  markTurnStatus,
  persistNewTurn,
  initSessions,
} from "./utils.js";
import type { ServerNotification } from "./generated/ServerNotification.js";
import type { ThreadStartResponse } from "./generated/v2/ThreadStartResponse.js";
import type { TurnStartResponse } from "./generated/v2/TurnStartResponse.js";
import type { UserInput } from "./generated/v2/UserInput.js";
import {
  PERSISTED_METHODS,
  type PersistedNotification,
} from "../../entity/codex/types.js";
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

      yield* initSessions;

      yield* Effect.addFinalizer(() =>
        Effect.forEach(
          activeTurns.entries(),
          ([sessionId, turn]) =>
            markTurnStatus(turn.turnId, sessionId, "interrupted"),
          { discard: true },
        ),
      );

      const handleNotification = (notification: ServerNotification) => {
        const effect = Effect.gen(function* () {
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
                yield* updateCodexTurnPayload(at.turnId, (payload) => ({
                  ...payload,
                  error: turn.error,
                }));
                yield* markTurnStatus(at.turnId, ourSessionId, "error");
              } else if (turn.status === "interrupted") {
                yield* markTurnStatus(at.turnId, ourSessionId, "interrupted");
              }

              activeTurns.delete(ourSessionId);
              break;
            }
            case "thread/name/updated": {
              const { threadId: sdkThreadId } = notification.params;
              const activeTurn = findActiveTurnBySdkThreadId(sdkThreadId);
              if (activeTurn) {
                const name = (notification.params as { name?: string }).name;
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
            default: {
              if (!PERSISTED_METHODS.has(notification.method)) break;

              // Skip SDK's item/started for userMessage — we already persist it in persistNewTurn
              if (notification.method === "item/started") {
                const item = (notification.params as { item?: { type?: string } }).item;
                if (item?.type === "userMessage") break;
              }

              const sdkThreadId = extractThreadId(notification);
              if (sdkThreadId) {
                const activeTurn = findActiveTurnBySdkThreadId(sdkThreadId);
                if (activeTurn) {
                  yield* codexEventSqliteEntity
                    .insert({
                      id: ulid(),
                      sessionId: activeTurn.ourSessionId,
                      turnId: activeTurn.turn.turnId,
                      data: notification as PersistedNotification,
                    })
                    .pipe(Effect.orDie);
                }
              }
              break;
            }
          }
        });
        fork(effect);
      };

      client.onNotification(handleNotification);

      const sdkThreadIdMap = new Map<string, string>();

      const findActiveTurnBySdkThreadId = (sdkThreadId: string) => {
        const ourSessionId = sdkThreadIdMap.get(sdkThreadId);
        if (!ourSessionId) return null;
        const turn = activeTurns.get(ourSessionId);
        if (!turn) return null;
        return { ourSessionId, turn };
      };

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

      const continueThread = (params: typeof ContinueThreadParams.Type) =>
        Effect.gen(function* () {
          const { sessionId } = params;

          const existing = activeTurns.get(sessionId);
          if (existing) {
            return yield* Effect.fail(
              new CodexChatError({
                message: "previous turn did not finish yet",
              }),
            );
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

          const turnId = ulid();
          yield* persistNewTurn(sessionId, turnId, params.prompt, session.model);

          const turn: ActiveTurn = { turnId, sdkTurnId: null };
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
            input: promptToCodexInput(params.prompt),
            model: session.model,
            approvalPolicy: "never",
            sandboxPolicy: { type: "dangerFullAccess" },
            ...(session.interactionMode === "plan"
              ? {
                  collaborationMode: {
                    mode: "plan" as const,
                    settings: {
                      model: session.model,
                      reasoning_effort: null,
                      developer_instructions: null,
                    },
                  },
                }
              : {}),
          })) as TurnStartResponse;

          turn.sdkTurnId = response.turn.id;
          yield* updateCodexTurnPayload(turnId, (payload) => ({
            ...payload,
            sdkTurnId: response.turn.id,
          }));
        }).pipe(
          Effect.tapError(() =>
            Effect.gen(function* () {
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

      const respondToApproval = (
        _params: typeof RespondToApprovalParams.Type,
      ) =>
        Effect.fail(
          new CodexChatError({
            message: "Not implemented yet for approval flow.",
          }),
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
        respondToApproval,
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
