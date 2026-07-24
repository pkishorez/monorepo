import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Effect } from 'effect';

import type { LaymosConfig } from '../../config/types.js';
import type { AnalysisWarning, LaymosReport } from '../../report/index.js';

import { buildReport } from '../build-report/index.js';
import type { LaymosError } from '../errors.js';
import { extractFileGraph } from '../extract-dependencies/index.js';
import { loadConfig } from '../../config/load-config/index.js';
import { resolveProject } from '../resolve-architecture/index.js';
import { validateRules } from '../validate-rules/index.js';

export interface AnalyzeProjectRequest {
  readonly projectDir: string;
}

/** Analyzes one project's declared and actual static architecture. */
export const analyzeProject = ({
  projectDir,
}: AnalyzeProjectRequest): Effect.Effect<LaymosReport, LaymosError> =>
  Effect.gen(function* () {
    const config = yield* loadConfig({ projectDir });
    const warnings = findMissingPathWarnings(projectDir, config);
    const fileGraph = yield* extractFileGraph(
      projectDir,
      config.sourceRoots,
      config.ignore ?? [],
    );
    const resolved = yield* resolveProject(config, fileGraph);
    const validation = yield* validateRules(resolved);
    return yield* buildReport(resolved, validation, warnings);
  }).pipe(Effect.withSpan('project.analyze'));

function findMissingPathWarnings(
  projectDir: string,
  config: LaymosConfig,
): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];
  for (const path of config.sourceRoots) {
    if (!existsSync(resolve(projectDir, path))) {
      warnings.push({ kind: 'missing-source-root', path });
    }
  }
  const layers = new Set(config.graphs.flatMap((graph) => [...graph.layers]));
  for (const layer of layers) {
    for (const path of layer.paths) {
      if (!existsSync(resolve(projectDir, path))) {
        warnings.push({
          kind: 'missing-layer-path',
          layer: layer.name,
          path,
        });
      }
    }
  }
  for (const module of config.modules ?? []) {
    if (!existsSync(resolve(projectDir, module.path))) {
      warnings.push({
        kind: 'missing-module-path',
        module: module.path,
        path: module.path,
      });
    }
  }
  return warnings;
}
