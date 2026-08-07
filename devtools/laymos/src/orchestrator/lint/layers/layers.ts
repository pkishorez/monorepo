import { Effect } from 'effect';

import { analyzeLayers as analyzeLayerPolicy } from '../../../domain/architecture-analysis/layers/index.js';
import { analyzeProject } from '../../project-analysis/index.js';

export function analyzeLayers(configPath: string) {
  return analyzeProject(configPath).pipe(
    Effect.map((project) =>
      analyzeLayerPolicy(
        project.fileGraph,
        project.config.layers,
        project.layerRules,
      ),
    ),
  );
}
