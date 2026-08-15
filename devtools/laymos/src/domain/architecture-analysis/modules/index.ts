/** Consumers use this Subpath to analyze configured Modules. */
export { analyzeModules } from './modules.js';
/** Renderers use this to consume Module analysis without changing it. */
export type { ModuleAnalysis } from '../../../architecture-analysis-schema/index.js';
/** Renderers use this as the complete analyzed description of one Module. */
export type {
  AnalyzedModule,
  ModuleKind,
  ModuleShape,
  ObservedModuleKind,
} from '../../../architecture-analysis-schema/index.js';
/** Renderers use this to identify the public door used by a valid dependency. */
export type { ModuleDependency } from '../../../architecture-analysis-schema/index.js';
/** Renderers use this to exhaustively handle every Module finding. */
export type { ModuleViolation } from '../../../architecture-analysis-schema/index.js';
export { findModuleCycles } from './dependency-graph.js';
