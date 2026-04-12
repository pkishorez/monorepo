import { AppRpcs } from "./app.js";
import { ClaudeRpcs } from "./claude.js";
import { CodexRpcs } from "./codex.js";
import { GitRpcs } from "./git.js";
import { WorkflowRpcs } from "./workflow.js";
import { RalphLoopRpcs } from "../../ralph-loop/api/definitions.js";

export { AppRpcs, AppError, OpenProjectParams } from "./app.js";
export { ClaudeRpcs, ClaudeChatError } from "./claude.js";
export { CodexRpcs, CodexChatError } from "./codex.js";
export { GitRpcs } from "./git.js";
export { WorkflowRpcs } from "./workflow.js";
export { RalphLoopRpcs } from "../../ralph-loop/api/definitions.js";
export { RalphLoopError } from "../../ralph-loop/api/schema.js";

export {
  CreateSessionParams,
  ContinueSessionParams,
  UpdateSessionParams,
  RespondToToolParams,
  Message,
  ToolResponse,
  PromptContent,
  ContentBlock,
  TextBlock,
  ImageBlock,
  MODELS as ClaudeModels,
} from "../../agents/claude/schema.js";
export type { ProjectedClaudeMessage } from "../../projection/claude-message.js";
export type {
  ProjectedCodexEvent,
  ProjectedToolCall,
} from "../../projection/codex-event.js";

export {
  CreateThreadParams,
  ContinueThreadParams,
  UpdateThreadParams,
  RespondToUserInputParams,
  MODELS as CodexModels,
} from "../../agents/codex/schema.js";

export {
  StartExecuteParams,
  ContinueExecuteParams,
  StopExecuteParams,
  ExecuteWorkflowError,
} from "../../agents/workflow/schema.js";

export const ApiRpcs = ClaudeRpcs.merge(AppRpcs)
  .merge(CodexRpcs)
  .merge(GitRpcs)
  .merge(WorkflowRpcs)
  .merge(RalphLoopRpcs);
