import { Data, Effect } from 'effect';
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import { glob as tinyglob } from 'tinyglobby';

export class FsError extends Data.TaggedError('FsError')<{
  path: string;
  cause: unknown;
}> {}

export const getCurrentDirectory = Effect.sync(() => process.cwd());

export const getParentDirectory = (dirPath: string): Effect.Effect<string> =>
  Effect.sync(() => nodePath.dirname(dirPath));

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory';
}

export const getDirectoryEntries = (
  dirPath: string,
): Effect.Effect<DirectoryEntry[], FsError> =>
  Effect.tryPromise({
    try: async () => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() || e.isDirectory())
        .map((e) => ({
          name: e.name,
          type: e.isFile() ? 'file' : ('directory' as const),
        }));
    },
    catch: (cause) => new FsError({ path: dirPath, cause }),
  });

export const readFile = (filePath: string): Effect.Effect<string, FsError> =>
  Effect.tryPromise({
    try: () => fs.readFile(filePath, 'utf-8'),
    catch: (cause) => new FsError({ path: filePath, cause }),
  });

export const writeFile = (
  filePath: string,
  content: string,
): Effect.Effect<void, FsError> =>
  Effect.tryPromise({
    try: () => fs.writeFile(filePath, content, 'utf-8'),
    catch: (cause) => new FsError({ path: filePath, cause }),
  });

export const fileExists = (filePath: string): Effect.Effect<boolean> =>
  Effect.tryPromise({
    try: async () => {
      await fs.access(filePath);
      return true;
    },
    catch: () => false,
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));

export const joinPath = (...paths: string[]): string => nodePath.join(...paths);

export const resolvePath = (...paths: string[]): string =>
  nodePath.resolve(...paths);

export const basename = (path: string): string => nodePath.basename(path);

export const dirname = (path: string): string => nodePath.dirname(path);

export const isRootPath = (dirPath: string): boolean =>
  nodePath.dirname(dirPath) === dirPath;

export const toRelativePath = (absolutePath: string, root: string): string =>
  nodePath.relative(root, absolutePath) || '.';

export interface GlobOptions {
  cwd: string;
  ignore?: string[];
  absolute?: boolean;
}

export const glob = (
  patterns: string[],
  options: GlobOptions,
): Effect.Effect<string[], FsError> =>
  Effect.tryPromise({
    try: () =>
      tinyglob(patterns, {
        cwd: options.cwd,
        ignore: options.ignore ?? [],
        absolute: options.absolute ?? true,
      }),
    catch: (cause) => new FsError({ path: options.cwd, cause }),
  });
