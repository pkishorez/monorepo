import { Layer } from "effect";
import { ClaudeHandlers } from "./claude.js";
import { HelloHandlers } from "./hello.js";

export { ClaudeHandlers, HelloHandlers };

export const ApiHandlers = Layer.mergeAll(HelloHandlers, ClaudeHandlers);
