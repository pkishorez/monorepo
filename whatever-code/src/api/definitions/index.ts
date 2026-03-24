import { AppRpcs } from "./app.js";
import { ClaudeRpcs } from "./claude.js";
import { CodexRpcs } from "./codex.js";
import { WorkflowRpcs } from "./workflow.js";

export { AppRpcs, AppError, OpenProjectParams } from "./app.js";
export { ClaudeRpcs, ClaudeChatError } from "./claude.js";
export { CodexRpcs, CodexChatError } from "./codex.js";
export { WorkflowRpcs } from "./workflow.js";

export {
  CreateSessionParams,
  ContinueSessionParams,
  UpdateSessionParams,
  RespondToToolParams,
  PermissionMode,
  Message,
  ToolResponse,
  MODELS as ClaudeModels,
} from "../../claude/schema.js";
export type { PermissionModeValue } from "../../claude/schema.js";

export {
  CreateThreadParams,
  ContinueThreadParams,
  UpdateThreadParams,
  RespondToApprovalParams,
  ApprovalPolicy,
  SandboxMode,
  MODELS as CodexModels,
} from "../../codex/schema.js";

export {
  StartExecuteParams,
  ContinueExecuteParams,
  StopExecuteParams,
  ExecuteWorkflowError,
  StartPlanParams,
  ContinuePlanParams,
  StartExecutePhaseParams,
  ContinueExecutePhaseParams,
  StopPlanAndExecuteParams,
  PlanAndExecuteWorkflowError,
} from "../../workflow/schema.js";

export const ApiRpcs = ClaudeRpcs.merge(AppRpcs).merge(CodexRpcs).merge(WorkflowRpcs);
