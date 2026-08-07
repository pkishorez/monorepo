import { Effect } from 'effect';

import { analyzeArchitecture } from '../../domain/architecture-analysis/index.js';
import { analyzeProject } from '../project-analysis/index.js';

export function lint(configPath: string) {
  return analyzeProject(configPath).pipe(
    Effect.map((project) => ({
      project,
      ...analyzeArchitecture(
        project.fileGraph,
        project.config.layers,
        project.config.modules,
        project.layerRules,
      ),
    })),
  );
}
