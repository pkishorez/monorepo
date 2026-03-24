import { Layer } from "effect";
import { AppHandlers } from "./app.js";
import { ClaudeHandlers } from "./claude.js";
import { CodexHandlers } from "./codex.js";
import { WorkflowHandlers } from "./workflow.js";

export { AppHandlers, ClaudeHandlers, CodexHandlers, WorkflowHandlers };

export const ApiHandlers = Layer.mergeAll(
  ClaudeHandlers,
  AppHandlers,
  CodexHandlers,
  WorkflowHandlers,
);
