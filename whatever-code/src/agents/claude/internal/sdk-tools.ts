import type {
  AskUserQuestionInput,
  ExitPlanModeInput,
} from "@anthropic-ai/claude-agent-sdk/sdk-tools";
import type { PendingQuestionItem } from "../../../entity/claude/claude.js";
import type { PromptContent } from "../../shared/schema.js";

export const isAskUserQuestion = (
  toolName: string,
  _input: Record<string, unknown>,
): _input is AskUserQuestionInput & Record<string, unknown> =>
  toolName === "AskUserQuestion";

export const extractQuestions = (
  input: AskUserQuestionInput,
): PendingQuestionItem[] => (input.questions ?? []) as PendingQuestionItem[];

export const extractPlan = (input: Record<string, unknown>): string | null => {
  const plan = (input as ExitPlanModeInput).plan;
  return typeof plan === "string" ? plan : null;
};

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
