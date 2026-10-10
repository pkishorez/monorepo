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
// Config readers use this to reject declarations no file list is needed for.
export { validateConfig } from './project-config.js';
// The package schema command publishes the domain-owned Config contract.
export { projectConfigJsonSchema } from './project-config.js';
// Path containment is the one relation every Rule and Exception is read by.
export {
  contains,
  isCanonicalPath,
  overlaps,
  sharedRuleSource,
} from './project-config.js';
