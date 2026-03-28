import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { Runtime } from "effect";
import type { sessionEntity } from "../../../entity/session/session.js";
import type { ClaudePayload } from "../../../entity/session/session.js";
import { when } from "../../../lib/object.js";
import { buildPlanModeRuntimeOptions } from "./plan-mode.js";
import type { SessionRuntimeOptions } from "./types.js";

type ClaudeSession = typeof sessionEntity.Type & {
  payload: typeof ClaudePayload.Type;
};

export const buildQueryOptions = (args: {
  session: ClaudeSession;
  sessionId: string;
  isNewSession: boolean;
  canUseTool: Options["canUseTool"];
  runtime: Runtime.Runtime<never>;
  turnId: string;
  runtimeOptions?: SessionRuntimeOptions | undefined;
}): Options => {
  const {
    session,
    sessionId,
    isNewSession,
    canUseTool,
    runtime,
    turnId,
    runtimeOptions,
  } = args;
  const { payload } = session;
  const isPlanMode = session.interactionMode === "plan";

  const planModeOptions: SessionRuntimeOptions | undefined = isPlanMode
    ? buildPlanModeRuntimeOptions(runtime, turnId)
    : undefined;

  const permissionMode = isPlanMode
    ? ("plan" as const)
    : payload.accessMode === "full-access"
      ? ("bypassPermissions" as const)
      : undefined;

  return {
    model: session.model,
    cwd: session.absolutePath,
    ...(isNewSession ? { sessionId } : { resume: sessionId }),
    ...(permissionMode ? { permissionMode } : {}),
    persistSession: payload.persistSession,
    effort: payload.effort,
    ...when(payload.maxTurns > 0, { maxTurns: payload.maxTurns }),
    ...when(payload.maxBudgetUsd > 0, { maxBudgetUsd: payload.maxBudgetUsd }),
    ...when(permissionMode === "bypassPermissions", {
      allowDangerouslySkipPermissions: true,
    }),
    canUseTool,
    toolConfig: { askUserQuestion: { previewFormat: "html" } },
    ...runtimeOptions,
    ...planModeOptions,
  } as Options;
};
