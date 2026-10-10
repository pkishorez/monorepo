/** Browser and RPC consumers use this canonical Architecture Analysis contract. */
export { ArchitectureAnalysisSchema } from './architecture-analysis-schema.js';
export type { ArchitectureAnalysis } from './architecture-analysis-schema.js';
/** The Config as authored and as carried over the wire. */
export {
  ConfigValidationIssueSchema,
  ExceptionSchema,
  ProjectConfigInputSchema,
  ProjectConfigSchema,
} from './project-config-schema.js';
export type {
  Config,
  ConfigException,
  ConfigValidationIssue,
} from './project-config-schema.js';
/** The Module tree read from disk. */
export {
  ModuleTreeSchema,
  TreeNodeKindSchema,
  TreeNodeSchema,
  TreeNodeShapeSchema,
} from './module-tree-schema.js';
export type {
  ModuleTree,
  TreeNode,
  TreeNodeKind,
  TreeNodeShape,
} from './module-tree-schema.js';
/** Every import between nodes, classified, and the findings that are not imports. */
export {
  FindingSchema,
  ImportVerdictSchema,
  ModuleImportSchema,
  RuleSchema,
  ViolationReasonSchema,
  ViolationRemedySchema,
} from './import-schema.js';
export type {
  Finding,
  ImportVerdict,
  ModuleImport,
  Rule,
  ViolationReason,
  ViolationRemedy,
} from './import-schema.js';
/** The File list of one Module and the content of one file. */
export {
  FileContentSchema,
  FileListEntrySchema,
  FileListSchema,
  FolderFileSchema,
} from './file-list-schema.js';
export type {
  FileContent,
  FileList,
  FileListEntry,
  FolderFile,
} from './file-list-schema.js';
