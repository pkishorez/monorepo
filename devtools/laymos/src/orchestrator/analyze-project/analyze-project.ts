import { Effect } from 'effect';
import { NodeServices } from '@effect/platform-node';

import { analyzeArchitecture } from '../../domain/architecture-analysis/index.js';
import { ConfigServiceLive } from '../../services/config/index.js';
import { CruiserLive } from '../../services/file-cruiser/index.js';
import { loadProject } from '../load-project/index.js';

export function analyzeProject(configPath: string) {
  return loadProject(configPath).pipe(
    Effect.map(({ config, fileGraph }) =>
      analyzeArchitecture(fileGraph, config),
    ),
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
  );
}
