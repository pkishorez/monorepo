import { relative, resolve } from 'node:path';

import { NodeServices } from '@effect/platform-node';
import { Data, Effect, FileSystem } from 'effect';

import type {
  FileContent,
  FileList,
  FolderFile,
} from '../../architecture-analysis-schema/index.js';
import { buildModuleTree, nodeByPath } from '../../domain/module-tree/index.js';
import { ConfigServiceLive } from '../../services/config/index.js';
import { CruiserLive } from '../../services/file-cruiser/index.js';
import { Git, GitLive } from '../../services/git/index.js';
import { loadProject } from '../load-project/index.js';

export class FileNotFound extends Data.TaggedError('FileNotFound')<{
  readonly path: string;
}> {}

export class FileReadError extends Data.TaggedError('FileReadError')<{
  readonly filePath: string;
  readonly cause: unknown;
}> {}

// Git's own test for binary content: a NUL byte near the start.
const binarySniffLength = 8000;

/**
 * The File list of one Module or Wrapper: every file git knows beneath its
 * folder, each marked analyzed or not. Without git, only analyzed files are
 * listed. Only paths inside the Project are ever listed.
 */
export function loadFileList(configPath: string, modulePath: string) {
  return Effect.gen(function* () {
    const { baseDir, config, fileGraph } = yield* loadProject(configPath);
    const tree = buildModuleTree(fileGraph.keys(), config.fileModules);
    const node = nodeByPath(tree, modulePath);
    if (node === undefined) {
      return yield* new FileNotFound({ path: modulePath });
    }
    const known = yield* knownFiles(baseDir).pipe(
      Effect.orElseSucceed(() => []),
    );
    const paths = [...new Set([...fileGraph.keys(), ...known])]
      .filter((path) =>
        node.shape === 'file' ? path === node.path : underPath(path, node.path),
      )
      .sort((left, right) => left.localeCompare(right));
    return {
      modulePath,
      ...(node.index === undefined ? {} : { index: node.index }),
      files: paths.map((path) => ({ path, analyzed: fileGraph.has(path) })),
    } satisfies FileList;
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
  );
}

/** Reads one file of the Project. A path outside the Project is not found. */
export function loadFileContent(configPath: string, path: string) {
  return Effect.gen(function* () {
    const { baseDir } = yield* loadProject(configPath);
    const absolute = resolve(baseDir, path);
    const inside = relative(baseDir, absolute);
    if (inside.startsWith('..') || resolve(absolute) !== absolute) {
      return yield* new FileNotFound({ path });
    }
    const fileSystem = yield* FileSystem.FileSystem;
    const bytes = yield* fileSystem
      .readFile(absolute)
      .pipe(
        Effect.mapError((cause) =>
          cause.reason._tag === 'NotFound'
            ? new FileNotFound({ path })
            : new FileReadError({ filePath: path, cause }),
        ),
      );
    return fileContent(path, bytes) satisfies FileContent;
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
      pathPrefixes.some((prefix) => underPath(path, prefix)),
    );
    const fileSystem = yield* FileSystem.FileSystem;
    const files: FolderFile[] = yield* Effect.forEach(paths, (path) =>
      fileSystem.readFile(resolve(baseDir, path)).pipe(
        Effect.map((bytes) => fileContent(path, bytes)),
        Effect.mapError(
          (cause) => new FileReadError({ filePath: path, cause }),
        ),
      ),
    );
    return { files };
  }).pipe(Effect.provide(NodeServices.layer));
}

function knownFiles(baseDir: string) {
  return Effect.gen(function* () {
    const git = yield* Git;
    return yield* git.knownFiles(baseDir);
  }).pipe(Effect.provide(GitLive));
}

function fileContent(path: string, bytes: Uint8Array): FileContent {
  const binary = bytes.subarray(0, binarySniffLength).includes(0);
  return {
    path,
    content: binary ? '' : new TextDecoder().decode(bytes),
    ...(binary ? { binary } : {}),
  };
}

function underPath(path: string, prefix: string): boolean {
  return prefix === '.' || path === prefix || path.startsWith(`${prefix}/`);
}
