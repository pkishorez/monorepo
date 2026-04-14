import { getSessionInfo, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Cause, Deferred, Effect, Exit, Queue } from "effect";
import { ulid } from "ulid";
import { claudeMessageSqliteEntity } from "../../../db/entities/claude.js";
import { sessionSqliteEntity } from "../../../db/entities/session.js";
import { updateClaudeTurnPayload, markTurnStatus } from "../../shared/turn.js";
import type { ActiveTurn } from "./types.js";

/** Extract model usage from a result message into our schema shape. */
function extractModelUsage(
  result: Record<string, unknown>,
): Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; contextWindow: number | null }> | null {
  const modelUsage = result.modelUsage as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!modelUsage) return null;

  const out: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; contextWindow: number | null }> = {};
  for (const [key, mu] of Object.entries(modelUsage)) {
    out[key] = {
      inputTokens: (mu.inputTokens as number) ?? 0,
      outputTokens: (mu.outputTokens as number) ?? 0,
      cacheReadInputTokens: (mu.cacheReadInputTokens as number) ?? 0,
      contextWindow: (mu.contextWindow as number) ?? null,
    };
  }
  return out;
}

/** Persists each SDK message to DB and routes init/result events. */
export const processMessage = (
  sessionId: string,
  turn: ActiveTurn,
  isNewSession: boolean,
) =>
  (message: SDKMessage) =>
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

      if (message.type === "assistant") {
        const content = (message as unknown as { content?: Array<{ type: string; name?: string; id?: string }> }).content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_use") {
              yield* Effect.logDebug("claude: tool_use").pipe(
                Effect.annotateLogs({
                  sessionId,
                  turnId: turn.turnId,
                  toolName: block.name ?? "unknown",
                  toolUseId: block.id ?? "unknown",
                }),
              );
            }
          }
        }
      }

      if (message.type === "system" && message.subtype === "init") {
        yield* Effect.log("session initialized").pipe(
          Effect.annotateLogs({ turnId: turn.turnId }),
        );
        yield* updateClaudeTurnPayload(turn.turnId, (payload) => ({
          ...payload,
          model: message.model,
          cwd: (message as unknown as Record<string, unknown>).cwd as
            | string
            | null ?? null,
        }));
        yield* Deferred.succeed(turn.initialized, void 0);
      } else if (message.type === "result") {
        turn.resultReceived = true;
        const status = message.is_error ? "error" : "success";

        yield* Effect.log("turn completed").pipe(
          Effect.annotateLogs({ turnId: turn.turnId, status }),
        );

        const resultRecord = message as unknown as Record<string, unknown>;
        yield* updateClaudeTurnPayload(turn.turnId, (payload) => ({
          ...payload,
          costUsd: (resultRecord.total_cost_usd as number) ?? null,
          isError: message.is_error ?? false,
          modelUsage: extractModelUsage(resultRecord),
          resultSubtype: (resultRecord.subtype as string) ?? null,
          resultErrors: Array.isArray(resultRecord.errors)
            ? (resultRecord.errors as string[])
            : null,
        }));
        yield* markTurnStatus(turn.turnId, sessionId, status);

        if (isNewSession) {
          yield* Effect.tryPromise(() => getSessionInfo(sessionId)).pipe(
            Effect.flatMap((info) => {
              if (!info?.summary) {
                // No name yet — still push terminal status
                return turn.onStatusUpdate
                  ? turn.onStatusUpdate({ status })
                  : Effect.void;
              }
              return Effect.all([
                sessionSqliteEntity
                  .update({ sessionId }, { name: info.summary })
                  .pipe(Effect.orDie, Effect.asVoid),
                turn.onStatusUpdate
                  ? turn.onStatusUpdate({ status, name: info.summary })
                  : Effect.void,
              ]).pipe(Effect.asVoid);
            }),
            Effect.catchAll(() => Effect.void),
          );
        } else if (turn.onStatusUpdate) {
          yield* turn.onStatusUpdate({ status });
        }

        yield* Queue.shutdown(turn.outputQueue);
      }
    }).pipe(
      Effect.withSpan("claude.processMessage", {
        attributes: {
          sessionId,
          turnId: turn.turnId,
          "message.type": message.type,
          "message.subtype": (message as any).subtype ?? null,
        },
      }),
    );

/** Handles fiber exit — cleans up turn state and marks status. */
export const onFiberExit = (
  sessionId: string,
  turn: ActiveTurn,
) =>
  (exit: Exit.Exit<void, Error>) =>
    Effect.gen(function* () {
      yield* Queue.shutdown(turn.outputQueue);

      if (turn.stopped) {
        yield* Deferred.fail(
          turn.initialized,
          new Error("session stopped"),
        );
        return;
      }

      if (Exit.isSuccess(exit)) {
        yield* Deferred.succeed(turn.initialized, void 0);
        if (!turn.resultReceived) {
          yield* Effect.logWarning(
            "background fiber exited without result message",
          );
          yield* markTurnStatus(turn.turnId, sessionId, "error");
          if (turn.onStatusUpdate) yield* turn.onStatusUpdate({ status: "error" });
        } else {
          yield* Effect.log("background fiber exited cleanly");
        }
      } else if (Exit.isInterrupted(exit)) {
        yield* Deferred.fail(
          turn.initialized,
          new Error("session interrupted before init"),
        );
        yield* Effect.log("background fiber interrupted");
        yield* markTurnStatus(turn.turnId, sessionId, "interrupted");
        if (turn.onStatusUpdate) yield* turn.onStatusUpdate({ status: "interrupted" });
      } else {
        const cause = exit.pipe(Exit.causeOption);
        const errorMsg =
          cause._tag === "Some" ? Cause.pretty(cause.value) : "unknown";
        yield* Deferred.fail(turn.initialized, new Error(errorMsg));
        yield* Effect.logError("background fiber failed").pipe(
          Effect.annotateLogs({ cause: errorMsg }),
        );
        yield* markTurnStatus(turn.turnId, sessionId, "error");
        if (turn.onStatusUpdate) yield* turn.onStatusUpdate({ status: "error" });
      }
    }).pipe(
      Effect.withSpan("claude.fiberExit", { attributes: { sessionId, turnId: turn.turnId } }),
    );
