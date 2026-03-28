import { Deferred, Effect, Runtime } from "effect";
import { claudeTurnSqliteEntity } from "../../../db/claude.js";
import { extractQuestions, isAskUserQuestion } from "./sdk-tools.js";
import type { PendingToolResponse } from "./types.js";
import type { ToolResponse } from "../schema.js";
import type { AccessMode } from "../../shared/schema.js";

const READ_ONLY_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "TaskGet",
  "TaskList",
  "TaskOutput",
  "LS",
]);

/**
 * Creates the `canUseTool` callback for the SDK query.
 * Intercepts `AskUserQuestion` to bridge the SDK with our pending-response flow.
 * In supervised mode, also intercepts non-read tools for user approval.
 */
export const makeCanUseTool = (args: {
  runtime: Runtime.Runtime<never>;
  turnId: string;
  pendingToolResponses: Map<string, PendingToolResponse>;
  accessMode: typeof AccessMode.Type;
}) => {
  const { runtime, turnId, pendingToolResponses, accessMode } = args;

  return async (
    toolName: string,
    input: Record<string, unknown>,
    opts: { toolUseID: string; signal: AbortSignal },
  ) => {
    if (isAskUserQuestion(toolName, input)) {
      return Runtime.runPromise(runtime)(
        Effect.gen(function* () {
          const deferred = yield* Deferred.make<typeof ToolResponse.Type, Error>();
          const questions = extractQuestions(input);
          pendingToolResponses.set(opts.toolUseID, { deferred, turnId });
          yield* claudeTurnSqliteEntity
            .update(
              { id: turnId },
              { pendingQuestion: { toolUseId: opts.toolUseID, questions } },
            )
            .pipe(Effect.orDie);

          const response = yield* Deferred.await(deferred);

          pendingToolResponses.delete(opts.toolUseID);
          yield* claudeTurnSqliteEntity
            .update({ id: turnId }, { pendingQuestion: null })
            .pipe(Effect.orDie);

          if (response.behavior === "allow") {
            return { ...response, updatedInput: response.updatedInput ?? input };
          }
          return response;
        }) as Effect.Effect<any, any, never>,
      );
    }

    if (accessMode === "supervised" && !READ_ONLY_TOOLS.has(toolName)) {
      return Runtime.runPromise(runtime)(
        Effect.gen(function* () {
          const deferred = yield* Deferred.make<typeof ToolResponse.Type, Error>();
          const approval = { toolUseId: opts.toolUseID, toolName, input };
          pendingToolResponses.set(opts.toolUseID, { deferred, turnId });

          const turn = yield* claudeTurnSqliteEntity.get({ id: turnId }).pipe(Effect.orDie);
          const current = turn?.value.pendingToolApprovals ?? [];
          yield* claudeTurnSqliteEntity
            .update(
              { id: turnId },
              { pendingToolApprovals: [...current, approval] },
            )
            .pipe(Effect.orDie);

          const response = yield* Deferred.await(deferred);

          pendingToolResponses.delete(opts.toolUseID);
          const turnAfter = yield* claudeTurnSqliteEntity.get({ id: turnId }).pipe(Effect.orDie);
          const remaining = (turnAfter?.value.pendingToolApprovals ?? [])
            .filter((a) => a.toolUseId !== opts.toolUseID);
          yield* claudeTurnSqliteEntity
            .update({ id: turnId }, { pendingToolApprovals: remaining })
            .pipe(Effect.orDie);

          if (response.behavior === "allow") {
            return { ...response, updatedInput: response.updatedInput ?? input };
          }
          return response;
        }) as Effect.Effect<any, any, never>,
      );
    }

    return { behavior: "allow" as const, updatedInput: input };
  };
};
