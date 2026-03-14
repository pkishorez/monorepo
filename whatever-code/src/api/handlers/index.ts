import { Layer } from "effect";
import { AppHandlers } from "./app.js";
import { ClaudeHandlers } from "./claude.js";

export { AppHandlers, ClaudeHandlers };

export const ApiHandlers = Layer.mergeAll(ClaudeHandlers, AppHandlers);
