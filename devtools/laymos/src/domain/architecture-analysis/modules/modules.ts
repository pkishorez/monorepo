import type {
  ModuleAnalysis,
  ModuleDefinition,
} from '../../../architecture-analysis-schema/index.js';
export type {
  AnalyzedModule,
  ModuleAnalysis,
  ModuleDefinition,
  ModuleDependency,
  ModuleKind,
  ModuleShape,
  ModuleViolation,
  ObservedModuleKind,
} from '../../../architecture-analysis-schema/index.js';
import type { FileGraph } from '../../file-graph/index.js';
import type { LayerContext, LayerDefinition } from '../layers/layers.js';
import { assignFilesToModules } from './module-membership.js';
import { describeModules } from './module-descriptors.js';
import { publicEntryPoints } from './public-entry-points.js';
import { findModuleViolations } from './violations/index.js';

export interface ModuleAnalysisContext {
  readonly fileGraph: FileGraph;
  readonly modules: Readonly<Record<string, ModuleDefinition>>;
  readonly membership: ReadonlyMap<string, string>;
  readonly layerContext: LayerContext;
  readonly entryPoints: ReadonlySet<string>;
}

export function analyzeModules(
  fileGraph: FileGraph,
  modules: Readonly<Record<string, ModuleDefinition>>,
  layerContext: LayerContext,
  layers: Readonly<Record<string, LayerDefinition>>,
): ModuleAnalysis {
  const membership = assignFilesToModules(fileGraph.keys(), modules);
  const entryPoints = publicEntryPoints(modules, fileGraph.keys());
  const findings = findModuleViolations({
    fileGraph,
    modules,
    membership,
    layerContext,
    entryPoints,
  });
  return {
    modules: describeModules(modules, layers, findings.dependencies),
    membership,
    entryPoints,
    dependencies: findings.dependencies,
    violations: findings.violations,
  };
}
