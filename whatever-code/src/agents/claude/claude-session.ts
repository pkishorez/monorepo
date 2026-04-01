import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Deferred, Effect, Fiber, Queue, Runtime, Stream } from "effect";
import { ulid } from "ulid";
import { ClaudeChatError } from "../../api/definitions/claude.js";
import { claudeTurnSqliteEntity } from "../../db/claude.js";
import { sessionSqliteEntity } from "../../db/session.js";
import { markTurnStatus, persistNewTurn } from "./utils.js";
import {
  buildQueryOptions,
  makeCanUseTool,
  processMessage,
  onFiberExit,
  toSDKPrompt,
} from "./internal/index.js";
import type {
  ActiveTurn,
  PendingToolResponse,
  SessionRuntimeOptions,
} from "./internal/index.js";
import type { PromptContent, ToolResponse } from "./schema.js";

export const makeSessionManager = (args: {
  sessionId: string;
  runtime: Runtime.Runtime<never>;
  fork: <A, E>(effect: Effect.Effect<A, E, any>) => Fiber.RuntimeFiber<A, E>;
}) => {
  const { sessionId, runtime, fork } = args;

  let currentTurn: ActiveTurn | null = null;
  const pendingToolResponses = new Map<string, PendingToolResponse>();

  const continueSession = (
    prompt: typeof PromptContent.Type,
    runtimeOptions?: SessionRuntimeOptions,
  ) =>
    Effect.gen(function* () {
      if (currentTurn) {
        const isOutputDone = yield* Queue.isShutdown(currentTurn.outputQueue);
        if (!isOutputDone) {
          return yield* Effect.fail(
            new ClaudeChatError({
              message: "previous turn did not finish yet",
            }),
          );
        }
        currentTurn = null;
      }

      const session = yield* sessionSqliteEntity.get({ sessionId }).pipe(
        Effect.orDie,
        Effect.flatMap((row) =>
          row && row.value.payload.type === "claude"
            ? Effect.succeed(
                row.value as typeof row.value & {
                  payload: { type: "claude" };
                },
              )
            : Effect.fail(
                new ClaudeChatError({
                  message: `session ${sessionId} not found`,
                }),
              ),
        ),
      );

      const existingTurns = yield* claudeTurnSqliteEntity
        .query("bySession", { pk: { sessionId }, sk: { ">": null } })
        .pipe(Effect.orDie);
      const isNewSession = existingTurns.items.length === 0;

      const turnId = ulid();
      yield* persistNewTurn(sessionId, turnId, prompt);

      const initialized = yield* Deferred.make<void, Error>();
      const turn = yield* Effect.map(
        Queue.unbounded<SDKMessage>(),
        (outputQueue): ActiveTurn => ({
          query: null,
          fiber: null,
          stopped: false,
          resultReceived: false,
          outputQueue,
          turnId,
          initialized,
        }),
      );
      currentTurn = turn;

      const canUseTool = makeCanUseTool({
        runtime,
        turnId,
        pendingToolResponses,
        accessMode: session.payload.accessMode,
      });

      const options = buildQueryOptions({
        session,
        sessionId,
        isNewSession,
        canUseTool,
        runtime,
        turnId,
        runtimeOptions,
      });

      const queryResult = query({
        prompt: toSDKPrompt(sessionId, prompt),
        options,
      });
      turn.query = queryResult;

      turn.fiber = fork(
        Stream.fromAsyncIterable(queryResult, (e) => new Error(String(e))).pipe(
          Stream.takeWhile(() => !turn.stopped),
          Stream.tap(processMessage(sessionId, turn)),
          Stream.runDrain,
          Effect.onExit(onFiberExit(sessionId, turn)),
          Effect.withSpan("claude.backgroundFiber", {
            attributes: { sessionId },
          }),
        ),
      );

      yield* Deferred.await(turn.initialized);
    }).pipe(
      Effect.mapError((e) =>
        e instanceof ClaudeChatError
          ? e
          : new ClaudeChatError({ message: String(e) }),
      ),
      Effect.withSpan("sessionManager.continue", {
        attributes: { sessionId },
      }),
    );

  const stop = () =>
    Effect.gen(function* () {
      const turn = currentTurn;
      if (!turn) return;

      turn.stopped = true;

      for (const [toolUseId, pending] of pendingToolResponses) {
        yield* Deferred.fail(pending.deferred, new Error("session stopped"));
        pendingToolResponses.delete(toolUseId);
      }

      currentTurn = null;
      yield* markTurnStatus(turn.turnId, sessionId, "interrupted");

      // Close the SDK query first to abort any in-flight API request,
      // unblocking the stream so the fiber can actually terminate.
      try {
        turn.query?.close();
      } catch {}

      const fiber = turn.fiber;
      turn.fiber = null;
      if (fiber && fiber.unsafePoll() === null) {
        yield* Fiber.interrupt(fiber);
      }

      yield* Queue.shutdown(turn.outputQueue);
    });

  const respondToTool = (
    toolUseId: string,
    response: typeof ToolResponse.Type,
  ) =>
    Effect.gen(function* () {
      const pending = pendingToolResponses.get(toolUseId);
      if (!pending) {
        return yield* Effect.fail(
          new ClaudeChatError({
            message: `tool response ${toolUseId} not found`,
          }),
        );
      }
      yield* Deferred.succeed(pending.deferred, response);
    });

  return {
    sessionId,
    continue: continueSession,
    stop,
    respondToTool,
  };
};
