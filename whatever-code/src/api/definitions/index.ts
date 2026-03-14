import { AppRpcs } from "./app.js";
import { ClaudeRpcs } from "./claude.js";

export * as Claude from "../../claude/index.js";

export const ApiRpcs = ClaudeRpcs.merge(AppRpcs);
