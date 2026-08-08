/** Browser and RPC consumers use this canonical Architecture Analysis contract. */
export {
  ArchitectureAnalysisSchema,
  ConfigValidationIssueSchema,
  LayerAnalysisSchema,
  ModuleAnalysisSchema,
  ProjectConfigSchema,
} from './architecture-analysis-schema.js';
/** Renderers and analyzers share these browser-safe data shapes. */
export type {
  AnalyzedModule,
  ArchitectureAnalysis,
  Config,
  ConfigValidationIssue,
  ForbiddenImport,
  LayerAnalysis,
  LayerDefinition,
  ModuleAnalysis,
  ModuleDefinition,
  ModuleDependency,
  ModuleKind,
  ModuleViolation,
} from './architecture-analysis-schema.js';
export {
  ModuleSourceFileSchema,
  ModuleSourceSnapshotSchema,
} from './module-source-schema.js';
export type {
  ModuleSourceFile,
  ModuleSourceSnapshot,
} from './module-source-schema.js';
