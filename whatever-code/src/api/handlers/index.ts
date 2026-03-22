import { Layer } from "effect";
import { AppHandlers } from "./app.js";
import { ClaudeHandlers } from "./claude.js";
import { CodexHandlers } from "./codex.js";

export { AppHandlers, ClaudeHandlers, CodexHandlers };

export const ApiHandlers = Layer.mergeAll(
  ClaudeHandlers,
  AppHandlers,
  CodexHandlers,
);
