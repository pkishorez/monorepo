import { dirname, resolve } from 'node:path';

import { Effect } from 'effect';

import type { FileGraph } from '../../domain/file-graph/index.js';
import { ConfigService, type Config } from '../../services/config/index.js';
import { Cruiser } from '../../services/file-cruiser/index.js';
import { combineLayerRules } from './layer-rules.js';

export interface ProjectAnalysis {
  readonly config: Config;
  readonly fileGraph: FileGraph;
  readonly layerRules: Readonly<Record<string, readonly string[]>>;
}

export function analyzeProject(configPath: string) {
  return Effect.gen(function* () {
    const absoluteConfigPath = resolve(configPath);
    const baseDir = dirname(absoluteConfigPath);
    const configService = yield* ConfigService;
    const config = yield* configService.read(absoluteConfigPath);
    const cruiser = yield* Cruiser;
    const fileGraph = yield* cruiser.cruise(
      baseDir,
      config.sourceRoots,
      config.ignoredPaths,
    );
    return {
      config,
      fileGraph,
      layerRules: combineLayerRules(config),
    } satisfies ProjectAnalysis;
  });
}
