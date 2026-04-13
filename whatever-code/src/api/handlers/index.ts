import { Layer } from "effect";
import { AppHandlers } from "./app.js";
import { ClaudeHandlers } from "./claude.js";
import { CodexHandlers } from "./codex.js";
import { GitHandlers } from "./git.js";
import { TerminalHandlers } from "./terminal.js";
import { WorkflowHandlers } from "./workflow.js";
import { RalphLoopHandlers } from "../../ralph-loop/api/handlers.js";

export { AppHandlers, ClaudeHandlers, CodexHandlers, GitHandlers, TerminalHandlers, WorkflowHandlers, RalphLoopHandlers };

export const ApiHandlers = Layer.mergeAll(
  ClaudeHandlers,
  AppHandlers,
  CodexHandlers,
  GitHandlers,
  TerminalHandlers,
  WorkflowHandlers,
  RalphLoopHandlers,
);
