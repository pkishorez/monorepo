import {
  query,
  getSessionInfo,
  type Options as QueryOptions,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { Cause, Deferred, Effect, Exit, Queue, Runtime, Stream } from "effect";
import { ulid } from "ulid";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../db/claude.js";
import type { ActiveTurn, ToolResponse } from "./schema.js";
import { markTurnStatus, updateProjectStatus } from "./utils.js";

export interface RunQueryParams {
  runtime: Runtime.Runtime<never>;
  activeTurns: Map<string, ActiveTurn>;
  sessionId: string;
  turn: ActiveTurn;
  prompt: string;
  queryOptions?: QueryOptions;
}

const createToolHandler = (
  runtime: Runtime.Runtime<never>,
  turn: ActiveTurn,
): NonNullable<QueryOptions["canUseTool"]> =>
  async (toolName, input, options) => {
    if (toolName !== "AskUserQuestion") {
      return { behavior: "allow", updatedInput: input };
    }

    const deferred = Runtime.runSync(runtime)(Deferred.make<ToolResponse>());
    turn.pendingTools.set(options.toolUseID, deferred);

    options.signal.addEventListener(
      "abort",
      () => {
        turn.pendingTools.delete(options.toolUseID);
        Runtime.runSync(runtime)(
          Deferred.succeed(deferred, {
            behavior: "deny",
            message: "Aborted",
          }),
        );
      },
      { once: true },
    );

    const response = await Runtime.runPromise(runtime)(
      Deferred.await(deferred),
    );
    turn.pendingTools.delete(options.toolUseID);
    return response;
  };

const persistMessage = (
  message: SDKMessage,
  sessionId: string,
  turnId: string,
  outputQueue: Queue.Queue<SDKMessage>,
) =>
  Effect.gen(function* () {
    yield* claudeMessageSqliteEntity
      .insert({ id: ulid(), sessionId, turnId, data: message })
      .pipe(Effect.orDie);
    yield* Queue.offer(outputQueue, message);
  });

const saveTurnInit = (message: SDKMessage, turnId: string, sessionId: string) =>
  Effect.all(
    [
      claudeTurnSqliteEntity
        .update({ id: turnId }, { init: message })
        .pipe(Effect.orDie),
      claudeSessionSqliteEntity
        .update({ id: sessionId }, { sdkSessionCreated: true })
        .pipe(Effect.orDie),
      updateProjectStatus(sessionId, "active"),
    ],
    { discard: true },
  );

const fetchSessionSummary = (sessionId: string) =>
  Effect.tryPromise(() => getSessionInfo(sessionId)).pipe(
    Effect.flatMap((info) => {
      if (!info?.summary) return Effect.void;
      return claudeSessionSqliteEntity
        .update({ id: sessionId }, { name: info.summary })
        .pipe(Effect.orDie);
    }),
    Effect.catchAll(() => Effect.void),
  );

const saveTurnResult = (
  message: SDKMessage & { type: "result" },
  turnId: string,
  sessionId: string,
) =>
  Effect.gen(function* () {
    const status = message.is_error ? "error" : "success";

    yield* Effect.log("turn completed").pipe(
      Effect.annotateLogs({ turnId, status }),
    );

    yield* claudeTurnSqliteEntity
      .update({ id: turnId }, { status, result: message })
      .pipe(Effect.orDie);
    yield* claudeSessionSqliteEntity
      .update({ id: sessionId }, { status })
      .pipe(Effect.orDie);

    yield* Effect.all(
      [
        fetchSessionSummary(sessionId),
        updateProjectStatus(sessionId, status === "error" ? "error" : "idle"),
      ],
      { discard: true },
    );
  });

const classifyExit = (
  exit: Exit.Exit<void, Error>,
  turnId: string,
  sessionId: string,
) => {
  if (Exit.isSuccess(exit)) {
    return Effect.log("background fiber exited cleanly");
  }

  if (Exit.isInterrupted(exit)) {
    return Effect.gen(function* () {
      yield* Effect.log("background fiber interrupted");
      yield* markTurnStatus(turnId, sessionId, "interrupted");
      yield* updateProjectStatus(sessionId, "idle");
    });
  }

  const cause = exit.pipe(Exit.causeOption);
  return Effect.gen(function* () {
    yield* Effect.logError("background fiber failed").pipe(
      Effect.annotateLogs({
        cause: cause._tag === "Some" ? Cause.pretty(cause.value) : "unknown",
      }),
    );
    yield* markTurnStatus(turnId, sessionId, "error");
    yield* updateProjectStatus(sessionId, "error");
  });
};

export const runQuery = (params: RunQueryParams) => {
  const { runtime, activeTurns, sessionId, turn, prompt, queryOptions } =
    params;

  const queryResult = query({
    prompt,
    options: {
      ...queryOptions,
      permissionMode: queryOptions?.permissionMode ?? "default",
      ...(queryOptions?.permissionMode === "bypassPermissions"
        ? { allowDangerouslySkipPermissions: true }
        : {}),
      abortController: turn.abortController,
      toolConfig: {
        askUserQuestion: { previewFormat: "html" },
      },
      canUseTool: createToolHandler(runtime, turn),
    },
  });

  type Message = typeof queryResult extends AsyncGenerator<infer T> ? T : never;

  const processMessage = (message: Message) =>
    Effect.gen(function* () {
      yield* persistMessage(message, sessionId, turn.turnId, turn.outputQueue);

      if (message.type === "system" && message.subtype === "init") {
        yield* Effect.log("session initialized").pipe(
          Effect.annotateLogs({ turnId: turn.turnId }),
        );
        yield* saveTurnInit(message, turn.turnId, sessionId);
      } else if (message.type === "result") {
        yield* saveTurnResult(message, turn.turnId, sessionId);
        yield* Queue.shutdown(turn.outputQueue);
      }
    });

  const onFiberExit = (exit: Exit.Exit<void, Error>) =>
    Effect.gen(function* () {
      yield* Queue.shutdown(turn.outputQueue);

      if (!activeTurns.has(sessionId)) return;
      activeTurns.delete(sessionId);

      yield* classifyExit(exit, turn.turnId, sessionId);
    });

  return Effect.forkScoped(
    Stream.fromAsyncIterable(queryResult, (e) => new Error(String(e))).pipe(
      Stream.tap(processMessage),
      Stream.runDrain,
      Effect.onExit(onFiberExit),
      Effect.withSpan("claude.backgroundFiber", {
        attributes: { sessionId },
      }),
    ),
  );
};
