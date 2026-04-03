/**
 * Creates the `canUseTool` callback for the SDK query.
 * All tools are auto-allowed. AskUserQuestion is denied since the
 * interactive answer flow is not implemented yet.
 */
export const makeCanUseTool = () => {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    _opts: { toolUseID: string; signal: AbortSignal },
  ) => {
    if (toolName === "AskUserQuestion") {
      return {
        behavior: "deny" as const,
        message: "Not implemented yet for approval flow.",
      };
    }
    return { behavior: "allow" as const, updatedInput: input };
  };
};
