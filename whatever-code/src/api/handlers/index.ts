import { Layer } from "effect";
import { AppHandlers } from "./app.js";
import { ClaudeHandlers } from "./claude.js";
import { CodexHandlers } from "./codex.js";
import { GitHandlers } from "./git.js";
import { WorkflowHandlers } from "./workflow.js";

export { AppHandlers, ClaudeHandlers, CodexHandlers, GitHandlers, WorkflowHandlers };

export const ApiHandlers = Layer.mergeAll(
  ClaudeHandlers,
  AppHandlers,
  CodexHandlers,
  GitHandlers,
  WorkflowHandlers,
);
