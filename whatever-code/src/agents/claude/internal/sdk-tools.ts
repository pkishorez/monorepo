import type { PromptContent } from "../../shared/schema.js";

/** Converts our PromptContent into the format the SDK `query()` expects. */
export const toSDKPrompt = (
  sessionId: string,
  prompt: typeof PromptContent.Type,
) =>
  typeof prompt === "string"
    ? prompt
    : (async function* () {
        yield {
          type: "user" as const,
          message: {
            role: "user" as const,
            content: prompt as unknown as any[],
          },
          parent_tool_use_id: null,
          session_id: sessionId,
        };
      })();
