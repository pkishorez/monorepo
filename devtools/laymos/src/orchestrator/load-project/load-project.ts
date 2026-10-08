import { dirname, resolve } from 'node:path';

import { Effect } from 'effect';

import type { FileGraph } from '../../domain/file-graph/index.js';
import { validateAgainstTree } from '../../domain/import-law/index.js';
import { buildModuleTree } from '../../domain/module-tree/index.js';
import type { Config } from '../../domain/project-config/index.js';
import { ConfigError, ConfigService } from '../../services/config/index.js';
import { Cruiser } from '../../services/file-cruiser/index.js';

export interface LoadedProject {
  readonly baseDir: string;
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
      config.storiesPath === undefined
        ? config.ignoredPaths
        : [...config.ignoredPaths, config.storiesPath],
    );
    const issues = [
      ...missingFileModules(config, fileGraph),
      ...validateAgainstTree(
        config,
        buildModuleTree(fileGraph.keys(), config.fileModules),
      ),
    ];
    if (issues.length > 0) {
      return yield* new ConfigError({
        reason: 'validation',
        filePath: absoluteConfigPath,
        cause: issues,
        issues,
      });
    }
    return { baseDir, config, fileGraph } satisfies LoadedProject;
  });
}

function missingFileModules(config: Config, fileGraph: FileGraph) {
  return config.fileModules
    .filter((path) => !fileGraph.has(path))
    .map((path) => ({
      kind: 'path' as const,
      message: `File Module is no analyzed source file: ${path}`,
    }));
}
