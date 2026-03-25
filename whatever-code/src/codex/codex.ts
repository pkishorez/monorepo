import { Effect, Runtime } from "effect";
import { v7 } from "uuid";
import { ulid } from "ulid";
import { CodexClient } from "./client.js";
import { CodexChatError } from "../api/definitions/codex.js";
import {
  codexEventSqliteEntity,
  codexThreadSqliteEntity,
  codexTurnSqliteEntity,
} from "../db/codex.js";
import type { ActiveTurn } from "./schema.js";
import {
  CreateThreadParams,
  ContinueThreadParams,
  UpdateThreadParams,
  RespondToApprovalParams,
} from "./schema.js";
import {
  markTurnStatus,
  persistNewTurn,
  initThreads,
} from "./utils.js";
import type { ServerNotification } from "../codex/generated/ServerNotification.js";
import type { ServerRequest } from "../codex/generated/ServerRequest.js";
import type { RequestId } from "../codex/generated/RequestId.js";
import type { ThreadStartResponse } from "../codex/generated/v2/ThreadStartResponse.js";
import type { TurnStartResponse } from "../codex/generated/v2/TurnStartResponse.js";
import type { SandboxPolicy } from "../codex/generated/v2/SandboxPolicy.js";
import type { SandboxMode } from "../codex/generated/v2/SandboxMode.js";
import {
  PERSISTED_METHODS,
  type PersistedNotification,
} from "../entity/codex/types.js";
import { errorMessage } from "../lib/error.js";

function sandboxModeToPolicy(mode: SandboxMode): SandboxPolicy {
  switch (mode) {
    case "read-only":
      return { type: "readOnly", access: { type: "fullAccess" }, networkAccess: false };
    case "workspace-write":
      return {
        type: "workspaceWrite",
        writableRoots: [],
        readOnlyAccess: { type: "fullAccess" },
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };
    case "danger-full-access":
      return { type: "dangerFullAccess" };
  }
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
      const pendingApprovals = new Map<
        string,
        { serverRequestId: RequestId; threadId: string; turnId: string }
      >();

      yield* initThreads;

      yield* Effect.addFinalizer(() =>
        Effect.forEach(
          activeTurns.entries(),
          ([threadId, turn]) =>
            markTurnStatus(turn.turnId, threadId, "interrupted"),
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
                yield* codexTurnSqliteEntity
                  .update(
                    { id: activeTurn.turn.turnId },
                    { sdkTurnId: turn.id },
                  )
                  .pipe(Effect.orDie);
                activeTurn.turn.sdkTurnId = turn.id;
              }
              break;
            }
            case "turn/completed": {
              const { threadId: sdkThreadId, turn } = notification.params;
              const activeTurn = findActiveTurnBySdkThreadId(sdkThreadId);
              if (!activeTurn) break;
              const { ourThreadId, turn: at } = activeTurn;

              if (turn.status === "completed") {
                yield* markTurnStatus(at.turnId, ourThreadId, "success");
              } else if (turn.status === "failed") {
                yield* codexTurnSqliteEntity
                  .update(
                    { id: at.turnId },
                    { status: "error", error: turn.error },
                  )
                  .pipe(Effect.orDie);
                yield* codexThreadSqliteEntity
                  .update({ threadId: ourThreadId }, { status: "error" })
                  .pipe(Effect.orDie);
              } else if (turn.status === "interrupted") {
                yield* markTurnStatus(at.turnId, ourThreadId, "interrupted");
              }

              activeTurns.delete(ourThreadId);
              break;
            }
            case "thread/name/updated": {
              const { threadId: sdkThreadId } = notification.params;
              const activeTurn = findActiveTurnBySdkThreadId(sdkThreadId);
              if (activeTurn) {
                const name = (notification.params as { name?: string }).name;
                if (name) {
                  yield* codexThreadSqliteEntity
                    .update(
                      { threadId: activeTurn.ourThreadId },
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
                yield* codexTurnSqliteEntity
                  .update(
                    { id: activeTurn.turn.turnId },
                    { usage: tokenUsage },
                  )
                  .pipe(Effect.orDie);
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
                      threadId: activeTurn.ourThreadId,
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

      const handleServerRequest = (
        serverRequestId: RequestId,
        request: ServerRequest,
      ) => {
        const effect = Effect.gen(function* () {
          const sdkThreadId = (request.params as { threadId?: string })
            .threadId;
          if (!sdkThreadId) return;

          const activeTurn = findActiveTurnBySdkThreadId(sdkThreadId);
          if (!activeTurn) return;

          const approvalId = ulid();

          yield* codexEventSqliteEntity
            .insert({
              id: approvalId,
              threadId: activeTurn.ourThreadId,
              turnId: activeTurn.turn.turnId,
              data: {
                method: request.method as ServerNotification["method"],
                params: request.params,
              } as ServerNotification,
            })
            .pipe(Effect.orDie);

          pendingApprovals.set(approvalId, {
            serverRequestId,
            threadId: activeTurn.ourThreadId,
            turnId: activeTurn.turn.turnId,
          });
        });
        fork(effect);
      };

      client.onNotification(handleNotification);
      client.onServerRequest(handleServerRequest);

      const sdkThreadIdMap = new Map<string, string>();

      const findActiveTurnBySdkThreadId = (sdkThreadId: string) => {
        const ourThreadId = sdkThreadIdMap.get(sdkThreadId);
        if (!ourThreadId) return null;
        const turn = activeTurns.get(ourThreadId);
        if (!turn) return null;
        return { ourThreadId, turn };
      };

      const createThread = (params: typeof CreateThreadParams.Type) =>
        Effect.gen(function* () {
          const threadId = v7();

          yield* codexThreadSqliteEntity
            .insert({
              threadId,
              status: "in_progress",
              absolutePath: params.absolutePath,
              model: params.model,
              approvalPolicy: params.approvalPolicy,
              sandboxMode: params.sandboxMode,
              sdkThreadId: null,
            })
            .pipe(Effect.orDie);

          const response = (yield* client.request("thread/start", {
            model: params.model,
            cwd: params.absolutePath,
            approvalPolicy: params.approvalPolicy,
            sandbox: params.sandboxMode,
            experimentalRawEvents: false,
            persistExtendedHistory: false,
          })) as ThreadStartResponse;

          const sdkThreadId = response.thread.id;
          yield* codexThreadSqliteEntity
            .update({ threadId }, { sdkThreadId })
            .pipe(Effect.orDie);
          sdkThreadIdMap.set(sdkThreadId, threadId);

          yield* continueThread({ threadId, prompt: params.prompt });
          return threadId;
        }).pipe(
          Effect.mapError((e) => new CodexChatError({ message: errorMessage(e) })),
        );

      const continueThread = (params: typeof ContinueThreadParams.Type) =>
        Effect.gen(function* () {
          const { threadId } = params;

          const existing = activeTurns.get(threadId);
          if (existing) {
            return yield* Effect.fail(
              new CodexChatError({
                message: "previous turn did not finish yet",
              }),
            );
          }

          const thread = yield* codexThreadSqliteEntity
            .get({ threadId })
            .pipe(
              Effect.orDie,
              Effect.flatMap((row) =>
                row
                  ? Effect.succeed(row.value)
                  : Effect.fail(
                      new CodexChatError({
                        message: `thread ${threadId} not found`,
                      }),
                    ),
              ),
            );

          if (!thread.sdkThreadId) {
            return yield* Effect.fail(
              new CodexChatError({
                message: `thread ${threadId} has no SDK thread ID`,
              }),
            );
          }

          const turnId = ulid();
          yield* persistNewTurn(threadId, turnId, params.prompt, thread.model);

          const turn: ActiveTurn = { turnId, sdkTurnId: null };
          activeTurns.set(threadId, turn);

          if (!sdkThreadIdMap.has(thread.sdkThreadId)) {
            yield* client.request("thread/resume", {
              threadId: thread.sdkThreadId,
              persistExtendedHistory: false,
            });
            sdkThreadIdMap.set(thread.sdkThreadId, threadId);
          }

          const response = (yield* client.request("turn/start", {
            threadId: thread.sdkThreadId,
            input: [{ type: "text", text: params.prompt, text_elements: [] }],
            model: thread.model,
            approvalPolicy: thread.approvalPolicy,
            sandboxPolicy: sandboxModeToPolicy(thread.sandboxMode as SandboxMode),
          })) as TurnStartResponse;

          turn.sdkTurnId = response.turn.id;
          yield* codexTurnSqliteEntity
            .update({ id: turnId }, { sdkTurnId: response.turn.id })
            .pipe(Effect.orDie);
        }).pipe(
          Effect.mapError((e) =>
            e instanceof CodexChatError
              ? e
              : new CodexChatError({ message: errorMessage(e) }),
          ),
        );

      const stopThread = (threadId: string) =>
        Effect.gen(function* () {
          const turn = activeTurns.get(threadId);
          if (!turn) return;

          const thread = yield* codexThreadSqliteEntity
            .get({ threadId })
            .pipe(Effect.orDie);
          if (!thread?.value.sdkThreadId) return;

          if (turn.sdkTurnId) {
            yield* client
              .request("turn/interrupt", {
                threadId: thread.value.sdkThreadId,
                turnId: turn.sdkTurnId,
              })
              .pipe(Effect.catchAll(() => Effect.void));
          }

          activeTurns.delete(threadId);
          yield* markTurnStatus(turn.turnId, threadId, "interrupted");
        });

      const updateThread = (params: typeof UpdateThreadParams.Type) =>
        codexThreadSqliteEntity
          .update({ threadId: params.threadId }, params.updates)
          .pipe(Effect.orDie);

      const respondToApproval = (
        params: typeof RespondToApprovalParams.Type,
      ) =>
        Effect.gen(function* () {
          const pending = pendingApprovals.get(params.requestId);
          if (!pending) {
            return yield* Effect.fail(
              new CodexChatError({
                message: `approval request ${params.requestId} not found`,
              }),
            );
          }

          const decision =
            params.decision === "accept"
              ? "accept"
              : params.decision === "acceptForSession"
                ? "acceptForSession"
                : "decline";

          client.respond(pending.serverRequestId, { decision });
          pendingApprovals.delete(params.requestId);
        });

      return {
        createThread,
        continueThread,
        stopThread,
        updateThread,
        respondToApproval,
      };
    }),
  },
) {}

function extractThreadId(notification: ServerNotification): string | null {
  const params = notification.params as { threadId?: string };
  return params.threadId ?? null;
}
