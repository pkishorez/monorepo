import type { FileGraph } from '../../file-graph/index.js';
import {
  buildAllowedDependencies,
  type AllowedDependencies,
} from './allowed-dependencies.js';
import { findCoverageViolations } from './coverage-violations.js';
import { findDependencyViolations } from './dependency-violations.js';
import { assignFilesToLayers } from './layer-membership.js';

export interface LayerDefinition {
  readonly paths: readonly string[];
}

export interface ForbiddenImport {
  readonly fromFile: string;
  readonly fromLayer: string;
  readonly toFile: string;
  readonly toLayer: string;
}

export interface LayerAnalysis extends LayerContext {
  readonly unassignedFiles: readonly string[];
  readonly forbiddenImports: readonly ForbiddenImport[];
}

export interface LayerContext {
  readonly membership: ReadonlyMap<string, string>;
  readonly allowedDependencies: AllowedDependencies;
  readonly permits: (fromLayer: string, toLayer: string) => boolean;
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
    permits: (fromLayer, toLayer) =>
      fromLayer === toLayer ||
      (allowedDependencies.get(fromLayer)?.has(toLayer) ?? false),
  };
}

export function analyzeLayers(
  fileGraph: FileGraph,
  layers: Readonly<Record<string, LayerDefinition>>,
  rules: Readonly<Record<string, readonly string[]>>,
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
  };
}
