import { dirname, resolve } from 'node:path';

import { Effect } from 'effect';

import type { FileGraph } from '../../domain/file-graph/index.js';
import {
  type Config,
  validateLoadedConfig,
} from '../../domain/project-config/index.js';
import { ConfigError, ConfigService } from '../../services/config/index.js';
import { Cruiser } from '../../services/file-cruiser/index.js';

export interface LoadedProject {
  readonly config: Config;
  readonly fileGraph: FileGraph;
}

export function loadProject(configPath: string) {
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
    const issues = validateLoadedConfig(config, fileGraph.keys());
    if (issues.length > 0) {
      return yield* new ConfigError({
        reason: 'validation',
        filePath: absoluteConfigPath,
        cause: issues,
        issues,
      });
    }
    return {
      config,
      fileGraph,
    } satisfies LoadedProject;
  });
}
