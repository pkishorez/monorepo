// Node consumers use this high-level capability to produce Architecture Analysis.
export { analyzeProject } from './orchestrator/analyze-project/index.js';
// Node consumers use this high-level capability to inspect one Configured Module.
export {
  loadModuleSource,
  ModuleSourceNotFound,
  ModuleSourceReadError,
} from './orchestrator/load-module-source/index.js';
// RPC transports use this browser-safe runtime contract for Architecture Analysis.
export { ArchitectureAnalysisSchema } from './architecture-analysis-schema/index.js';
// Renderers name the complete renderer-neutral analysis they consume.
export type { ArchitectureAnalysis } from './architecture-analysis-schema/index.js';
export { ModuleSourceSnapshotSchema } from './architecture-analysis-schema/index.js';
export type {
  ModuleSourceFile,
  ModuleSourceSnapshot,
} from './architecture-analysis-schema/index.js';
// Package and CLI consumers use this focused source Dependency query.
export { queryDependencies } from './orchestrator/query-dependencies/index.js';
// Dependency query callers distinguish a Target outside the analysis universe.
export { DependencyTargetNotFound } from './orchestrator/query-dependencies/index.js';
// Analysis callers distinguish Config loading and validation failures.
export { ConfigError } from './services/config/index.js';
// Analysis callers distinguish source cruising failures.
export { CruiseError } from './services/file-cruiser/index.js';
