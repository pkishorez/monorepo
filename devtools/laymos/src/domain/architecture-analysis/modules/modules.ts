import type {
  Config,
  ModuleAnalysis,
} from '../../../architecture-analysis-schema/index.js';
export type {
  AnalyzedModule,
  AnalyzedModuleGraph,
  ModuleAnalysis,
  ModuleDefinition,
  ModuleDependency,
  ModuleGraphDefinition,
  ModuleShape,
  ModuleViolation,
  ObservedModuleKind,
} from '../../../architecture-analysis-schema/index.js';
import type { FileGraph } from '../../file-graph/index.js';
import type { ResolvedConfig } from '../../project-config/index.js';
import type { LayerContext } from '../layers/index.js';
import { assignFilesToModules } from './module-membership.js';
import { describeModules, describeModuleGraphs } from './module-descriptors.js';
import { publicEntryPoints } from './public-entry-points.js';
import { findModuleViolations } from './violations/index.js';

export interface ModuleAnalysisContext {
  readonly fileGraph: FileGraph;
  readonly modules: ResolvedConfig['modules'];
  readonly graphs: ResolvedConfig['graphs'];
  readonly membership: ReadonlyMap<string, string>;
  readonly layerContext: LayerContext;
  readonly entryPoints: ReadonlySet<string>;
  readonly rootLayers: ReadonlySet<string>;
}

export function analyzeModules(
  fileGraph: FileGraph,
  resolved: ResolvedConfig,
  layerContext: LayerContext,
  config: Config,
): ModuleAnalysis {
  const membership = assignFilesToModules(fileGraph.keys(), resolved.modules);
  const entryPoints = publicEntryPoints(resolved.modules, fileGraph.keys());
  const findings = findModuleViolations({
    fileGraph,
    modules: resolved.modules,
    graphs: resolved.graphs,
    membership,
    layerContext,
    entryPoints,
    rootLayers: findRootLayers(config, layerContext),
  });
  return {
    modules: describeModules(resolved.modules, findings.dependencies),
    graphs: describeModuleGraphs(resolved.graphs),
    membership,
    entryPoints,
    dependencies: findings.dependencies,
    violations: findings.violations,
  };
}

// A Layer no other Layer may depend on is where hosts enter, so its unimported
// Modules are Intentional roots rather than dead code.
function findRootLayers(
  config: Config,
  layerContext: LayerContext,
): ReadonlySet<string> {
  const depended = new Set<string>();
  for (const destinations of layerContext.allowedDependencies.values()) {
    for (const destination of destinations) depended.add(destination);
  }
  return new Set(
    Object.keys(config.layers).filter((layer) => !depended.has(layer)),
  );
}
