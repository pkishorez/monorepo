import type {
  CanUseTool,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import { Deferred, Effect, Exit, Runtime } from "effect";
import type { AccessMode } from "../../../core/entity/session/session.js";
import { AskUserQuestionInput } from "../../../core/entity/turn/turn.js";
import { updateClaudeTurnPayload } from "../../shared/turn.js";
import type { ActiveTurn } from "./types.js";
import { SqliteDB } from "@std-toolkit/sqlite";

/**
 * Creates the `canUseTool` callback for the SDK query.
 *
 * In full-access mode every tool is auto-allowed via this callback
 * instead of relying on `dangerouslySkipPermissions` or similar flags.
 *
 * Denied tools:
 *  - ExitPlanMode  — plan lifecycle is managed by the UI, not the agent.
 *
 * Deferred tools:
 *  - AskUserQuestion — creates a Deferred that blocks until the user
 *    responds via the `respondToUserQuestion` RPC. The pending state is
 *    persisted to the turn payload so the frontend can render the question UI.
 */
export const makeCanUseTool = (
  _accessMode: typeof AccessMode.Type,
  turn: ActiveTurn,
  runtime: Runtime.Runtime<SqliteDB>,
): CanUseTool => {
  return async (toolName, input, opts): Promise<PermissionResult> => {
    if (toolName === "ExitPlanMode") {
      const planInput = input as Record<string, unknown>;
      if (typeof planInput.plan === "string" && planInput.plan.length > 0) {
        await Runtime.runPromise(runtime)(
          Effect.gen(function* () {
            yield* updateClaudeTurnPayload(turn.turnId, (payload) => ({
              ...payload,
              state: "plan-ready" as const,
            }));
            if (turn.onStatusUpdate) {
              yield* turn.onStatusUpdate({ status: "plan-ready" });
            }
          }),
        );
      }
      turn.planExited = true;
      return {
        behavior: "deny",
        message:
          "ExitPlanMode is explicitly managed by us. Exit the program now.",
      };
    }

    if (toolName === "AskUserQuestion") {
      const toolUseId = opts.toolUseID;

      // Create a Deferred that will be resolved when the user responds
      const program = Effect.gen(function* () {
        const deferred = yield* Deferred.make<PermissionResult, Error>();
        turn.pendingQuestions.set(toolUseId, deferred);

        // Persist pending state to turn DB so the frontend can discover it
        yield* updateClaudeTurnPayload(turn.turnId, (payload) => ({
          ...payload,
          state: "question" as const,
          pendingQuestions: {
            ...payload.pendingQuestions,
            [toolUseId]: {
              status: "pending" as const,
              question: input as typeof AskUserQuestionInput.Type,
            },
          },
        }));

        if (turn.onStatusUpdate) {
          yield* turn.onStatusUpdate({ status: "question" });
        }

        // Block until the user responds (or the session is stopped)
        return yield* Deferred.await(deferred);
      });

      // Bridge from Effect world to the plain Promise the SDK expects
      const fiber = Runtime.runFork(runtime)(
        program as Effect.Effect<PermissionResult, Error, SqliteDB>,
      );
      const exit = await Effect.runPromise(
        fiber.await as Effect.Effect<Exit.Exit<PermissionResult, Error>>,
      );

      // Clean up the in-memory map entry
      turn.pendingQuestions.delete(toolUseId);

      if (Exit.isSuccess(exit)) {
        return exit.value;
      }

      // Deferred was failed (e.g. session stopped) — deny the tool
      return {
        behavior: "deny",
        message: "User question was cancelled.",
      };
    }

    return { behavior: "allow", updatedInput: input };
  };
};
