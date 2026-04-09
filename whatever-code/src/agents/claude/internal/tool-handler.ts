import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { AccessMode } from "../../../entity/session/session.js";

/**
 * Creates the `canUseTool` callback for the SDK query.
 *
 * In full-access mode every tool is auto-allowed via this callback
 * instead of relying on `dangerouslySkipPermissions` or similar flags.
 *
 * Denied tools:
 *  - ExitPlanMode  — plan lifecycle is managed by the UI, not the agent.
 *  - AskUserQuestion — interactive answer flow is not implemented yet.
 */
export const makeCanUseTool = (
  _accessMode: typeof AccessMode.Type,
): CanUseTool => {
  return async (toolName, input, _opts): Promise<PermissionResult> => {
    if (toolName === "ExitPlanMode") {
      return {
        behavior: "deny",
        message: "ExitPlanMode is managed by the UI.",
        interrupt: true,
      };
    }
    if (toolName === "AskUserQuestion") {
      return {
        behavior: "deny",
        message: "Not implemented yet for approval flow.",
      };
    }
    return { behavior: "allow", updatedInput: input };
  };
};
