import { Deferred, Effect, Runtime } from "effect";
import { claudeTurnSqliteEntity } from "../../../db/claude.js";
import { extractQuestions, isAskUserQuestion } from "./sdk-tools.js";
import type { PendingToolResponse } from "./types.js";
import type { ToolResponse } from "../schema.js";

/**
 * Creates the `canUseTool` callback for the SDK query.
 * Intercepts `AskUserQuestion` to bridge the SDK with our pending-response flow.
 */
export const makeCanUseTool = (args: {
  runtime: Runtime.Runtime<never>;
  turnId: string;
  pendingToolResponses: Map<string, PendingToolResponse>;
}) => {
  const { runtime, turnId, pendingToolResponses } = args;

  return async (
    toolName: string,
    input: Record<string, unknown>,
    opts: { toolUseID: string; signal: AbortSignal },
  ) => {
    if (!isAskUserQuestion(toolName, input)) {
      return { behavior: "allow" as const };
    }
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

        return response;
      }) as Effect.Effect<any, any, never>,
    );
  };
};
