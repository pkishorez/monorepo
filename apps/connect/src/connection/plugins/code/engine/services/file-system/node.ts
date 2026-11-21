import {
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { Effect, Layer } from 'effect';
import {
  AccessDenied,
  AlreadyExists,
  FileSystem,
  IoError,
  NotFound,
  type EntryKind,
} from '../../capabilities/index.js';

/*
 * The File System of this computer, over `node:fs/promises`, home as
 * `node:os` says. Node's error codes become the key's four errors: a path
 * not there, or through a file, is NotFound; one this user may not touch is
 * AccessDenied; EEXIST from a new folder is AlreadyExists; anything else is
 * an IoError with Node's words.
 */

const codeOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** What a Node error at `path` is, as the key says it. */
const failure = (path: string) => (error: unknown) => {
  const code = codeOf(error);
  if (code === 'ENOENT' || code === 'ENOTDIR') return new NotFound({ path });
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS')
    return new AccessDenied({ path });
  return new IoError({ path, message: messageOf(error) });
};

const attempt = <A>(path: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: failure(path) });

const kindOf = (found: {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}): EntryKind =>
  found.isSymbolicLink()
    ? 'symlink'
    : found.isDirectory()
      ? 'folder'
      : found.isFile()
        ? 'file'
        : 'other';

const byName = (a: { name: string }, b: { name: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

const service: FileSystem['Service'] = {
  home: homedir(),
  list: (path) =>
    attempt(path, () => readdir(path, { withFileTypes: true })).pipe(
      Effect.map((dirents) =>
        dirents
          .map((dirent) => ({
            name: dirent.name,
            kind: kindOf(dirent),
            hidden: dirent.name.startsWith('.'),
          }))
          .sort(byName),
      ),
    ),
  stat: (path) =>
    attempt(path, () => stat(path)).pipe(
      Effect.map((found) => ({
        kind: found.isDirectory()
          ? ('folder' as const)
          : found.isFile()
            ? ('file' as const)
            : ('other' as const),
      })),
    ),
  realpath: (path) => attempt(path, () => realpath(path)),
  mkdir: (path, options) =>
    Effect.tryPromise({
      try: () => mkdir(path, { recursive: options?.recursive ?? false }),
      catch: (error) =>
        codeOf(error) === 'EEXIST'
          ? new AlreadyExists({ path })
          : failure(path)(error),
    }).pipe(Effect.asVoid),
  readFile: (path) =>
    attempt(path, () => readFile(path)).pipe(
      Effect.map((buffer) => new Uint8Array(buffer)),
    ),
  writeFile: (path, data) => attempt(path, () => writeFile(path, data)),
  remove: (path, options) =>
    attempt(path, () =>
      rm(path, {
        recursive: options?.recursive ?? false,
        force: options?.force ?? false,
      }),
    ),
};

/** The File System of the computer this runs on. */
export const nodeFileSystem: Layer.Layer<FileSystem> = Layer.succeed(
  FileSystem,
  service,
);
