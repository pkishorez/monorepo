import { dirname, resolve } from 'node:path';

import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem } from 'effect';

import type { ModuleSourceFile } from '../../architecture-analysis-schema/index.js';
import { ConfigServiceLive } from '../../services/config/index.js';
import { CruiserLive } from '../../services/file-cruiser/index.js';
import { loadProject } from '../load-project/index.js';
import { SourceFileReadError } from './errors.js';

export { SourceFileReadError } from './errors.js';

/**
 * Reads every analyzed file at or below one of the given project-relative
 * path prefixes — a Configured Module's, Module Graph's, or Layer scope's
 * own root. A prefix outside the analysis universe matches nothing, so a
 * caller can never use this to read a file outside the Project.
 */
export function loadSourceFiles(
  configPath: string,
  pathPrefixes: readonly string[],
) {
  const absoluteConfigPath = resolve(configPath);
  const baseDir = dirname(absoluteConfigPath);

  return Effect.gen(function* () {
    const { fileGraph } = yield* loadProject(absoluteConfigPath);
    const paths = [...fileGraph.keys()]
      .filter((path) => underAnyPrefix(path, pathPrefixes))
      .sort((left, right) => left.localeCompare(right));

    const fileSystem = yield* FileSystem.FileSystem;
    const files: ModuleSourceFile[] = yield* Effect.forEach(paths, (path) =>
      fileSystem.readFileString(resolve(baseDir, path)).pipe(
        Effect.map((content) => ({ path, content }) as const),
        Effect.mapError(
          (cause) => new SourceFileReadError({ filePath: path, cause }),
        ),
      ),
    );

    return { files };
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
  );
}

function underAnyPrefix(
  path: string,
  pathPrefixes: readonly string[],
): boolean {
  return pathPrefixes.some(
    (prefix) =>
      prefix === '.' || path === prefix || path.startsWith(`${prefix}/`),
  );
}
