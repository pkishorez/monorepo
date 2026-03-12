import { ClaudeRpcs } from "./claude.js";
import { HelloRpcs } from "./hello.js";

export * as Claude from "./integrations/claude/index.js";

export const ApiRpcs = HelloRpcs.merge(ClaudeRpcs);
