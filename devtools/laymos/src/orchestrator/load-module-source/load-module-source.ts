import { dirname, resolve } from 'node:path';

import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem } from 'effect';

import type { ModuleSourceSnapshot } from '../../architecture-analysis-schema/index.js';
import { analyzeArchitecture } from '../../domain/architecture-analysis/index.js';
import { ConfigServiceLive } from '../../services/config/index.js';
import { CruiserLive } from '../../services/file-cruiser/index.js';
import { loadProject } from '../load-project/index.js';
import { ModuleSourceNotFound, ModuleSourceReadError } from './errors.js';

export { ModuleSourceNotFound, ModuleSourceReadError } from './errors.js';

export function loadModuleSource(configPath: string, modulePath: string) {
  const absoluteConfigPath = resolve(configPath);
  const baseDir = dirname(absoluteConfigPath);

  return Effect.gen(function* () {
    const { config, fileGraph } = yield* loadProject(absoluteConfigPath);
    const analysis = analyzeArchitecture(fileGraph, config);
    const module = analysis.moduleAnalysis.modules.find(
      ({ path }) => path === modulePath,
    );
    if (module === undefined) {
      return yield* new ModuleSourceNotFound({ modulePath });
    }

    const paths = [...analysis.moduleAnalysis.membership]
      .filter(([, owner]) => owner === modulePath)
      .map(([path]) => path)
      .sort((left, right) => left.localeCompare(right));
    const fileSystem = yield* FileSystem.FileSystem;
    const files = yield* Effect.forEach(paths, (path) =>
      fileSystem.readFileString(resolve(baseDir, path)).pipe(
        Effect.map((content) => ({ path, content }) as const),
        Effect.mapError(
          (cause) => new ModuleSourceReadError({ filePath: path, cause }),
        ),
      ),
    );
    const rootEntryPoint = moduleEntryPoint(
      modulePath,
      analysis.moduleAnalysis.entryPoints,
    );

    return {
      modulePath,
      ...(rootEntryPoint === undefined ? {} : { entryPoint: rootEntryPoint }),
      files,
    } satisfies ModuleSourceSnapshot;
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
  );
}

function moduleEntryPoint(
  modulePath: string,
  entryPoints: ReadonlySet<string>,
): string | undefined {
  if (entryPoints.has(modulePath)) return modulePath;
  const directoryEntryPoint = `${modulePath}/index.ts`;
  return entryPoints.has(directoryEntryPoint) ? directoryEntryPoint : undefined;
}
