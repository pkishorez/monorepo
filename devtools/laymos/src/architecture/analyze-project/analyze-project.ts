import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Effect } from 'effect';

import type { LaymosConfig } from '../../config/types.js';
import type { AnalysisWarning, LaymosReport } from '../../report/index.js';
import { findLaymosSurfaces } from '../../stories/discover-stories/laymos-surface.js';
import { flow, step } from '../../stories/authoring/index.js';
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
export const analyzeProject = flow(
  'Analyze project',
  {
    description:
      'Coordinates the static journey from authored configuration to one architecture report.',
    attributes: ({ projectDir }: AnalyzeProjectRequest) => ({ projectDir }),
  },
  ({
    projectDir,
  }: AnalyzeProjectRequest): Effect.Effect<LaymosReport, LaymosError> =>
    Effect.gen(function* () {
      const config = yield* loadConfig({ projectDir });
      const warnings = findMissingPathWarnings(projectDir, config);
      const laymosSurfaces = yield* step(
        'Discover Laymos surfaces',
        {
          description:
            'Finds Module-owned Laymos surfaces so analysis can separate Stories, Tests, and support code from production architecture.',
        },
        () =>
          Effect.promise(() =>
            findLaymosSurfaces(projectDir, config.modules ?? []),
          ),
      );
      const fileGraph = yield* step(
        'Extract project dependencies',
        {
          description:
            'Walks the configured source roots and uses skott to build the internal file dependency graph.',
        },
        () =>
          extractFileGraph(
            projectDir,
            config.sourceRoots,
            config.ignore ?? [],
            laymosSurfaces,
          ),
      );
      const resolved = yield* step(
        'Resolve declared architecture',
        {
          description:
            'Assigns every extracted file and import to its declared Layer and Module ownership.',
        },
        () => resolveProject(config, fileGraph),
      );
      const validation = yield* step(
        'Validate architecture rules',
        {
          description:
            'Checks resolved imports against Layer reachability and Module constraints while keeping violations as data.',
        },
        () => validateRules(resolved),
      );
      return yield* step(
        'Build architecture report',
        {
          description:
            'Serializes declarations, files, violations, coverage, warnings, and documentation into the shared report.',
        },
        () => buildReport(resolved, validation, warnings),
      );
    }),
);

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
