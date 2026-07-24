import { Effect } from 'effect';

import type { LaymosConfig } from '../../config/types.js';
import type {
  AnalysisWarning,
  LaymosReport,
  ReportArchitecture,
  ReportFile,
  ReportLayer,
  ReportModule,
} from '../../report/index.js';
import type { ResolvedProject } from '../resolve-architecture/index.js';
import type { RuleValidation } from '../validate-rules/index.js';

function emitArchitecture(config: LaymosConfig): ReportArchitecture {
  const layers: Record<string, ReportLayer> = {};
  for (const graph of config.graphs) {
    for (const layer of graph.layers) {
      layers[layer.name] = {
        paths: layer.paths,
        ...(layer.description !== undefined
          ? { description: layer.description }
          : {}),
      };
    }
  }

  const modules: Record<string, ReportModule> = {};
  for (const module of config.modules ?? []) {
    modules[module.path] = {
      ...(module.description === undefined
        ? {}
        : { description: module.description }),
      ...(module.documentation === undefined
        ? {}
        : { documentation: module.documentation.content }),
    };
  }

  return {
    sourceRoots: config.sourceRoots,
    layers,
    graphs: config.graphs.map((graph) => ({
      name: graph.name,
      layers: graph.layers.map((layer) => layer.name),
      edges: graph.edges.map((edge) => ({
        from: edge.from.name,
        to: edge.to.name,
      })),
      ...(graph.description !== undefined
        ? { description: graph.description }
        : {}),
    })),
    modules,
    moduleRules: (config.moduleRules ?? []).map((rules) => ({
      module: rules.module.path,
      ...(rules.canImport !== undefined
        ? { canImport: rules.canImport.map((module) => module.path) }
        : {}),
      ...(rules.canImportedBy !== undefined
        ? {
            canImportedBy: rules.canImportedBy.map((module) => module.path),
          }
        : {}),
    })),
    ignoredPaths: config.ignore ?? [],
  };
}

function emitFiles(resolved: ResolvedProject): Record<string, ReportFile> {
  const files: Record<string, ReportFile> = {};
  for (const [path, file] of Object.entries(resolved.files)) {
    const imports = resolved.fileGraph.files[path]?.imports ?? [];
    if (file.kind === 'covered') {
      files[path] = {
        kind: 'covered',
        layer: file.layer,
        ...(file.module !== undefined ? { module: file.module } : {}),
        imports,
      };
      continue;
    }
    files[path] = { kind: file.kind, imports };
  }
  return files;
}

/** Emits the canonical, serializable result of Laymos analysis. */
export function buildReport(
  resolved: ResolvedProject,
  validation: RuleValidation,
  warnings: readonly AnalysisWarning[] = [],
): Effect.Effect<LaymosReport> {
  return Effect.succeed({
    architecture: emitArchitecture(resolved.config),
    files: emitFiles(resolved),
    violations: validation.violations,
    coverage: validation.coverage,
    warnings,
  }).pipe(Effect.withSpan('report.build'));
}
