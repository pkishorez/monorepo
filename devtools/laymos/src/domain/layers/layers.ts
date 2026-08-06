import type { FileGraph } from '../file-graph/index.js';
import { buildAllowedDependencies } from './allowed-dependencies.js';
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

export interface LayerLintResult {
  readonly unassignedFiles: readonly string[];
  readonly forbiddenImports: readonly ForbiddenImport[];
}

export function lintLayers(
  fileGraph: FileGraph,
  layers: Readonly<Record<string, LayerDefinition>>,
  rules: Readonly<Record<string, readonly string[]>>,
): LayerLintResult {
  const membership = assignFilesToLayers(fileGraph.keys(), layers);
  const allowedDependencies = buildAllowedDependencies(rules);
  return {
    unassignedFiles: findCoverageViolations(fileGraph.keys(), membership),
    forbiddenImports: findDependencyViolations(
      fileGraph,
      membership,
      allowedDependencies,
    ),
  };
}
