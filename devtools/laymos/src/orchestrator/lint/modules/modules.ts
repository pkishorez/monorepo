import { Effect } from 'effect';

import { analyzeLayers } from '../../../domain/architecture-analysis/layers/index.js';
import { analyzeModules as analyzeModulePolicy } from '../../../domain/architecture-analysis/modules/index.js';
import { analyzeProject } from '../../project-analysis/index.js';

export function analyzeModules(configPath: string) {
  return analyzeProject(configPath).pipe(
    Effect.map((project) =>
      analyzeModulePolicy(
        project.fileGraph,
        project.config.modules,
        analyzeLayers(
          project.fileGraph,
          project.config.layers,
          project.layerRules,
        ),
        project.config.layers,
      ),
    ),
  );
}
