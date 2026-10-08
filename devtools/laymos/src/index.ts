// Node consumers use this high-level capability to produce Architecture Analysis.
export { analyzeProject } from './orchestrator/analyze-project/index.js';
// Node consumers use this high-level capability to inspect one Configured Module.
export {
  loadModuleSource,
  ModuleSourceNotFound,
  ModuleSourceReadError,
} from './orchestrator/load-module-source/index.js';
// Node consumers use this high-level capability to read documentation at any scope.
export {
  loadDocumentation,
  DocumentationReadError,
  DocumentationScopeNotFound,
} from './orchestrator/load-documentation/index.js';
// Node consumers use this high-level capability to read arbitrary source files by path.
export {
  loadFolderFiles,
  loadSourceFiles,
  SourceFileReadError,
} from './orchestrator/load-source-files/index.js';
// RPC transports use this browser-safe runtime contract for Architecture Analysis.
export { ArchitectureAnalysisSchema } from './architecture-analysis-schema/index.js';
// Renderers name the complete renderer-neutral analysis they consume.
export type { ArchitectureAnalysis } from './architecture-analysis-schema/index.js';
export { ModuleSourceSnapshotSchema } from './architecture-analysis-schema/index.js';
export type {
  ModuleSourceFile,
  ModuleSourceSnapshot,
} from './architecture-analysis-schema/index.js';
export {
  DocumentationScopeSchema,
  DocumentationSchema,
} from './architecture-analysis-schema/index.js';
export type {
  Documentation,
  DocumentationScope,
} from './architecture-analysis-schema/index.js';
export {
  InspectionTargetNotFound,
  ModuleInspectionCycle,
  inspectFile,
  inspectLayer,
  inspectModule,
  inspectProject,
} from './orchestrator/inspect/index.js';
export type {
  FileInspection,
  FileInspectionOptions,
  LayerInspection,
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
