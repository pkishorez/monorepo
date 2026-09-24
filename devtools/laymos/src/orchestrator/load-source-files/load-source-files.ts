import { dirname, resolve } from 'node:path';

import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem } from 'effect';

import type { ModuleSourceFile } from '../../architecture-analysis-schema/index.js';
import { ConfigServiceLive } from '../../services/config/index.js';
import { CruiserLive } from '../../services/file-cruiser/index.js';
import { Git, GitLive } from '../../services/git/index.js';
import { loadProject } from '../load-project/index.js';
import { SourceFileReadError } from './errors.js';

export { SourceFileReadError } from './errors.js';

// Git's own test for binary content: a NUL byte near the start.
const binarySniffLength = 8000;

/**
 * Reads every file at or below one of the given project-relative path
 * prefixes — a Configured Module's, Module Graph's, or Layer scope's own root.
 * Files git knows beside the analyzed ones are read too, marked as Unanalyzed
 * files; without git, only analyzed files are read. Only paths inside the Project are ever listed, so a caller can never
 * use this to read a file outside it.
 */
export function loadSourceFiles(
  configPath: string,
  pathPrefixes: readonly string[],
) {
  const absoluteConfigPath = resolve(configPath);
  const baseDir = dirname(absoluteConfigPath);

  return Effect.gen(function* () {
    const { fileGraph } = yield* loadProject(absoluteConfigPath);
    const known = yield* knownFiles(baseDir).pipe(
      Effect.orElseSucceed(() => []),
    );
    const paths = [...new Set([...fileGraph.keys(), ...known])]
      .filter((path) => underAnyPrefix(path, pathPrefixes))
      .sort((left, right) => left.localeCompare(right));

    const files = yield* readFiles(baseDir, paths, (path) =>
      fileGraph.has(path),
    );
    return { files };
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
  );
}

/**
 * Reads every file git knows at or below one of the given paths of a folder,
 * such as a Package's files within its Monorepo. Paths are relative to the
 * folder, and only paths inside it are ever listed.
 */
export function loadFolderFiles(
  folder: string,
  pathPrefixes: readonly string[],
) {
  const baseDir = resolve(folder);
  return Effect.gen(function* () {
    const paths = (yield* knownFiles(baseDir)).filter((path) =>
      underAnyPrefix(path, pathPrefixes),
    );
    const files = yield* readFiles(baseDir, paths, () => true);
    return { files };
  }).pipe(Effect.provide(NodeServices.layer));
}

function knownFiles(baseDir: string) {
  return Effect.gen(function* () {
    const git = yield* Git;
    return yield* git.knownFiles(baseDir);
  }).pipe(Effect.provide(GitLive));
}

function readFiles(
  baseDir: string,
  paths: readonly string[],
  isAnalyzed: (path: string) => boolean,
) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const files: ModuleSourceFile[] = yield* Effect.forEach(paths, (path) =>
      fileSystem.readFile(resolve(baseDir, path)).pipe(
        Effect.map((bytes) => sourceFile(path, bytes, isAnalyzed(path))),
        Effect.mapError(
          (cause) => new SourceFileReadError({ filePath: path, cause }),
        ),
      ),
    );
    return files;
  });
}

function sourceFile(
  path: string,
  bytes: Uint8Array,
  analyzed: boolean,
): ModuleSourceFile {
  const binary = bytes.subarray(0, binarySniffLength).includes(0);
  return {
    path,
    content: binary ? '' : new TextDecoder().decode(bytes),
    ...(binary ? { binary } : {}),
    ...(analyzed ? {} : { unanalyzed: true }),
  };
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
