import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import { Effect, Runtime } from "effect";
import { claudeTurnSqliteEntity } from "../../../db/claude.js";
import { extractPlan } from "./sdk-tools.js";
import type { SessionRuntimeOptions } from "./types.js";

export const buildPlanModeRuntimeOptions = (
  rt: Runtime.Runtime<never>,
  turnId: string,
): SessionRuntimeOptions => {
  const captureExitPlanMode = async (hookInput: HookInput) => {
    if (hookInput.hook_event_name === "PreToolUse") {
      const plan = extractPlan(hookInput.tool_input as Record<string, unknown>);
      if (plan) {
        await Runtime.runPromise(rt)(
          claudeTurnSqliteEntity
            .update({ id: turnId }, { planArtifact: plan })
            .pipe(Effect.orDie, Effect.asVoid) as Effect.Effect<void>,
        );
      }
    }
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        permissionDecision: "deny" as const,
      },
    };
  };

  const denyAllPermissionRequests = async (hookInput: HookInput) => {
    // AskUserQuestion must always reach the user — even in plan mode,
    // Claude needs to ask clarifying questions to build a good plan.
    if ("tool_name" in hookInput && hookInput.tool_name === "AskUserQuestion") {
      return {
        hookSpecificOutput: {
          hookEventName: "PermissionRequest" as const,
          decision: { behavior: "allow" as const },
        },
      };
    }

    return {
      hookSpecificOutput: {
        hookEventName: "PermissionRequest" as const,
        decision: {
          behavior: "deny" as const,
          message:
            "Planning mode does not allow operations that require permission.",
        },
      },
    };
  };

  return {
    hooks: {
      PreToolUse: [{ matcher: "ExitPlanMode", hooks: [captureExitPlanMode] }],
      PermissionRequest: [{ hooks: [denyAllPermissionRequests] }],
    },
  };
};
