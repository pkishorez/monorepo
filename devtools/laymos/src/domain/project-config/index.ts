// Config readers use the canonical runtime contract for a Laymos Config.
export {
  ProjectConfigInputSchema,
  ProjectConfigSchema,
} from './project-config.js';
// External analysis consumers use the decoded Config shape by name.
export type { Config } from './project-config.js';
// Config errors preserve semantic validation details for CLI and RPC views.
export type { ConfigValidationIssue } from './project-config.js';
// Config readers use this decoder so the domain schema remains authoritative.
export { decodeProjectConfig } from './project-config.js';
// Config readers use this to reject contradictory architecture declarations.
export { validateConfig } from './project-config.js';
// Project loaders validate configured Module paths against supported source files.
export { validateLoadedConfig } from './project-config.js';
// The package schema command publishes the domain-owned Config contract.
export { projectConfigJsonSchema } from './project-config.js';
// Analysis resolves the nested Layer declaration into flat Modules and Graphs.
export { resolveConfig } from './project-config.js';
// Analysis consumers name the resolved shape when threading it through.
export type { ResolvedConfig } from './project-config.js';
