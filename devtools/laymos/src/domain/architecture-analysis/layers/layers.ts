import type {
  LayerAnalysis,
  LayerDefinition,
  ModuleDefinition,
} from '../../../architecture-analysis-schema/index.js';
export type {
  ForbiddenImport,
  LayerAnalysis,
  LayerDefinition,
} from '../../../architecture-analysis-schema/index.js';
import type { FileGraph } from '../../file-graph/index.js';
import {
  buildAllowedDependencies,
  type AllowedDependencies,
} from './allowed-dependencies.js';
import { findCoverageViolations } from './coverage-violations.js';
import { findDependencyViolations } from './dependency-violations.js';
import { assignFilesToLayers } from './layer-membership.js';
import { findLayersWithoutModules } from './module-coverage-violations.js';

export interface LayerContext {
  readonly membership: ReadonlyMap<string, string>;
  readonly allowedDependencies: AllowedDependencies;
}

export function buildLayerContext(
  files: Iterable<string>,
  layers: Readonly<Record<string, LayerDefinition>>,
  rules: Readonly<Record<string, readonly string[]>>,
): LayerContext {
  const membership = assignFilesToLayers(files, layers);
  const allowedDependencies = buildAllowedDependencies(rules);
  return {
    membership,
    allowedDependencies,
  };
}

export function analyzeLayers(
  fileGraph: FileGraph,
  layers: Readonly<Record<string, LayerDefinition>>,
  rules: Readonly<Record<string, readonly string[]>>,
  modules: Readonly<Record<string, ModuleDefinition>>,
): LayerAnalysis {
  const context = buildLayerContext(fileGraph.keys(), layers, rules);
  return {
    ...context,
    unassignedFiles: findCoverageViolations(
      fileGraph.keys(),
      context.membership,
    ),
    forbiddenImports: findDependencyViolations(
      fileGraph,
      context.membership,
      context.allowedDependencies,
    ),
    layersWithoutModules: findLayersWithoutModules(layers, modules),
  };
}
