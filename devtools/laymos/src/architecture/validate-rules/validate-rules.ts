import { Effect } from 'effect';

import type {
  Coverage,
  LayerCoverage,
  LayerViolation,
  ModuleCoverage,
  ModuleViolation,
  Violation,
} from '../../report/index.js';
import type { ResolvedProject } from '../resolve-architecture/index.js';

export type {
  Coverage,
  LayerCoverage,
  LayerViolation,
  ModuleCoverage,
  ModuleViolation,
  Violation,
};

export interface RuleValidation {
  readonly violations: readonly Violation[];
  readonly coverage: Coverage;
}

export function validateRules(
  resolved: ResolvedProject,
): Effect.Effect<RuleValidation> {
  const violations: Violation[] = [];
  const rules = new Map(
    (resolved.config.moduleRules ?? []).map((rule) => [rule.module.path, rule]),
  );

  for (const fromPath of Object.keys(resolved.fileGraph.files).sort()) {
    const from = resolved.files[fromPath];
    if (from?.kind !== 'covered') continue;

    for (const toPath of resolved.fileGraph.files[fromPath]!.imports) {
      const to = resolved.files[toPath];
      if (to?.kind !== 'covered') continue;

      if (
        from.layer !== to.layer &&
        !(resolved.reachability[from.layer] ?? []).includes(to.layer)
      ) {
        violations.push({
          kind: 'layer',
          from: { layer: from.layer, file: fromPath },
          to: { layer: to.layer, file: toPath },
        });
      }

      if (
        from.module === undefined ||
        to.module === undefined ||
        from.module === to.module
      ) {
        continue;
      }

      const fromRule = rules.get(from.module);
      if (
        fromRule?.canImport !== undefined &&
        !fromRule.canImport.some((module) => module.path === to.module)
      ) {
        violations.push({
          kind: 'module',
          rule: 'canImport',
          from: { module: from.module, layer: from.layer, file: fromPath },
          to: { module: to.module, layer: to.layer, file: toPath },
        });
      }

      const toRule = rules.get(to.module);
      if (
        toRule?.canImportedBy !== undefined &&
        !toRule.canImportedBy.some((module) => module.path === from.module)
      ) {
        violations.push({
          kind: 'module',
          rule: 'canImportedBy',
          from: { module: from.module, layer: from.layer, file: fromPath },
          to: { module: to.module, layer: to.layer, file: toPath },
        });
      }
    }
  }

  const visibleFiles = Object.values(resolved.files).filter(
    (file) => file.kind !== 'ignored',
  );
  const coveredFiles = visibleFiles.filter((file) => file.kind === 'covered');
  const uncoveredFiles = visibleFiles
    .filter((file) => file.kind === 'uncovered')
    .map((file) => file.path)
    .sort();
  const layerNames = [
    ...new Set(
      resolved.config.graphs.flatMap((graph) =>
        graph.layers.map((layer) => layer.name),
      ),
    ),
  ];

  return Effect.succeed({
    violations,
    coverage: {
      layers: {
        totalFiles: visibleFiles.length,
        coveredFiles: coveredFiles.length,
        uncovered: uncoveredFiles,
      },
      modules: layerNames.map((layer) => {
        const layerFiles = coveredFiles.filter((file) => file.layer === layer);
        const uncovered = layerFiles
          .filter((file) => file.module === undefined)
          .map((file) => file.path)
          .sort();
        return {
          layer,
          totalFiles: layerFiles.length,
          coveredFiles: layerFiles.length - uncovered.length,
          uncovered,
        };
      }),
    },
  }).pipe(Effect.withSpan('architecture.validate'));
}
