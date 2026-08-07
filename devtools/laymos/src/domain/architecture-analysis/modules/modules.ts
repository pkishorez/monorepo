import type { FileGraph } from '../../file-graph/index.js';
import type { LayerContext, LayerDefinition } from '../layers/layers.js';
import { assignFilesToModules } from './module-membership.js';
import { describeModules } from './module-descriptors.js';
import { publicEntryPoints } from './public-entry-points.js';
import { findUnexposedModules } from './unexposed-modules.js';
import { findModuleViolations } from './violations/index.js';

export interface ModuleDefinition {
  readonly shared: boolean;
  readonly nested: readonly string[];
}

export interface ModuleImportViolation {
  readonly fromFile: string;
  readonly fromModule: string;
  readonly toFile: string;
  readonly toModule: string;
}

export interface ModuleDependency {
  readonly fromModule: string;
  readonly toModule: string;
  readonly toEntryPoint: string;
}

export type ModuleKind = 'regular' | 'root' | 'terminal' | 'isolated';

export interface AnalyzedModule {
  readonly path: string;
  readonly layer: string;
  readonly shared: boolean;
  readonly nested: readonly string[];
  readonly kind: ModuleKind;
}

export type ModuleViolation =
  | {
      readonly kind: 'coverage';
      readonly file: string;
    }
  | {
      readonly kind: 'missing-entry-point';
      readonly module: string;
      readonly path: string;
    }
  | ({ readonly kind: 'dependency' } & ModuleImportViolation)
  | ({ readonly kind: 'boundary' } & ModuleImportViolation)
  | {
      readonly kind: 'cycle';
      readonly modules: readonly string[];
    };

export interface ModuleAnalysis {
  readonly modules: readonly AnalyzedModule[];
  readonly membership: ReadonlyMap<string, string>;
  readonly unexposedModules: ReadonlySet<string>;
  readonly entryPoints: ReadonlySet<string>;
  readonly dependencies: readonly ModuleDependency[];
  readonly violations: readonly ModuleViolation[];
}

export interface ModuleAnalysisContext {
  readonly fileGraph: FileGraph;
  readonly modules: Readonly<Record<string, ModuleDefinition>>;
  readonly membership: ReadonlyMap<string, string>;
  readonly unexposedModules: ReadonlySet<string>;
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
  const unexposedModules = findUnexposedModules(fileGraph.keys(), modules);
  const entryPoints = publicEntryPoints(modules, unexposedModules);
  const findings = findModuleViolations({
    fileGraph,
    modules,
    membership,
    unexposedModules,
    layerContext,
    entryPoints,
  });
  return {
    modules: describeModules(modules, layers, findings.dependencies),
    membership,
    unexposedModules,
    entryPoints,
    dependencies: findings.dependencies,
    violations: findings.violations,
  };
}
