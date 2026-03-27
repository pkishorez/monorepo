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
  PromptContent,
  ContentBlock,
  TextBlock,
  ImageBlock,
  MODELS as ClaudeModels,
} from "../../agents/claude/schema.js";
export type { PermissionModeValue } from "../../agents/claude/schema.js";

export {
  CreateThreadParams,
  ContinueThreadParams,
  UpdateThreadParams,
  RespondToApprovalParams,
  ApprovalPolicy,
  SandboxMode,
  MODELS as CodexModels,
} from "../../agents/codex/schema.js";

export {
  StartExecuteParams,
  ContinueExecuteParams,
  StopExecuteParams,
  ExecuteWorkflowError,
} from "../../agents/workflow/schema.js";

export const ApiRpcs = ClaudeRpcs.merge(AppRpcs).merge(CodexRpcs).merge(WorkflowRpcs);
