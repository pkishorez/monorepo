import { ClaudeRpcs } from "./claude.js";
import { HelloRpcs } from "./hello.js";

export const ApiRpcs = HelloRpcs.merge(ClaudeRpcs);
