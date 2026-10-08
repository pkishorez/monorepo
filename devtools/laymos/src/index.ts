// Node consumers use this high-level capability to produce Architecture Analysis.
export { analyzeProject } from './orchestrator/analyze-project/index.js';
// Node consumers use this to list a Module's files and read one of them.
export {
  FileNotFound,
  FileReadError,
  loadFileContent,
  loadFileList,
  loadFolderFiles,
} from './orchestrator/load-files/index.js';
// RPC transports use this browser-safe runtime contract for Architecture Analysis.
export {
  ArchitectureAnalysisSchema,
  FileContentSchema,
  FileListSchema,
  FolderFileSchema,
} from './architecture-analysis-schema/index.js';
// Renderers name the complete renderer-neutral analysis they consume.
export type {
  ArchitectureAnalysis,
  Config,
  ConfigException,
  FileContent,
  FileList,
  FileListEntry,
  Finding,
  FolderFile,
  ImportVerdict,
  ModuleImport,
  ModuleTree,
  Rule,
  TreeNode,
  ViolationReason,
  ViolationRemedy,
} from './architecture-analysis-schema/index.js';
export {
  InspectionTargetNotFound,
  inspectFile,
  inspectModule,
  inspectProject,
} from './orchestrator/inspect/index.js';
export type {
  FileInspection,
  FileInspectionOptions,
  ModuleInspection,
  ProjectInspection,
} from './orchestrator/inspect/index.js';
// Analysis callers distinguish Config loading and validation failures.
export { ConfigError } from './services/config/index.js';
// Analysis callers distinguish source cruising failures.
export { CruiseError } from './services/file-cruiser/index.js';
// Node consumers use this high-level capability to load, run, and read back Stories.
export {
  findTellingIssues,
  getStoryTree,
  loadStoryReports,
  planStories,
  runStories,
  StoriesError,
} from './orchestrator/run-stories/index.js';
export type {
  RunStoriesOptions,
  StoriesRun,
  StoryTellingIssue,
} from './orchestrator/run-stories/index.js';
// RPC transports use this browser-safe runtime contract for Stories.
export {
  ProofReportSchema,
  ProofRunEventSchema,
  StoryTreeSchema,
} from './story/schema/index.js';
export type {
  ProofLeaf,
  ProofReport,
  ProofRunEvent,
  StoryNode,
  StoryTree,
  TellingIssue,
} from './story/schema/index.js';
// Node consumers use this high-level capability to report what a Base ref changed.
export {
  loadBranches,
  loadChangeSet,
  loadFileDiff,
  loadKnownFiles,
} from './orchestrator/load-changes/index.js';
// Change set callers distinguish a missing repository from a failed git command.
export { GitError } from './services/git/index.js';
// RPC transports use this browser-safe runtime contract for Change sets.
export {
  BranchSchema,
  ChangedPathSchema,
  ChangeSetSchema,
  ChangeStatusSchema,
  DiffHunkSchema,
  DiffLineSchema,
  FileDiffSchema,
} from './change-set-schema/index.js';
// Renderers name the change decoration they apply to an Architecture Analysis.
export type {
  Branch,
  ChangedPath,
  ChangeSet,
  ChangeStatus,
  DiffHunk,
  DiffLine,
  FileDiff,
} from './change-set-schema/index.js';
