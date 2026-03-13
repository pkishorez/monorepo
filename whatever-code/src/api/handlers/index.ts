import { Layer } from "effect";
import { ClaudeHandlers } from "./claude.js";

export { ClaudeHandlers };

export const ApiHandlers = Layer.mergeAll(ClaudeHandlers);
