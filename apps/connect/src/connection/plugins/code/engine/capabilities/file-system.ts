import { Context, Data, type Effect } from 'effect';

/*
 * The computer's File System, as the engine touches it: the home folder,
 * a folder's entries, what a path is, its symlinks resolved, a folder
 * made, a file read, written or removed. Folders list and make folders
 * under home over it, the Folder Check stats a Project's folder, a
 * message's files are saved through it, and a Harness Account's config
 * folder is checked with it. Every path is absolute. Each call fails only
 * with the four errors below, picked as Node's `fs` would: a browser's
 * fake picks the same. The implementation is services/file-system/:
 * `node.ts` on this computer, `fake/` in a browser tab.
 */

/** Nothing is at the path, or a folder on the way is a file (ENOENT, ENOTDIR). */
export class NotFound extends Data.TaggedError('NotFound')<{
  readonly path: string;
}> {}

/** This user may not (EACCES, EPERM, EROFS). */
export class AccessDenied extends Data.TaggedError('AccessDenied')<{
  readonly path: string;
}> {}

/** Something is at the path already (EEXIST). */
export class AlreadyExists extends Data.TaggedError('AlreadyExists')<{
  readonly path: string;
}> {}

/** Any other failure, with what the File System said. */
export class IoError extends Data.TaggedError('IoError')<{
  readonly path: string;
  readonly message: string;
}> {}

/** What an entry is, its symlink not followed. */
export type EntryKind = 'folder' | 'file' | 'symlink' | 'other';

/** One entry of a folder. */
export interface DirEntry {
  readonly name: string;
  readonly kind: EntryKind;
  /** Its name starts with `.`. */
  readonly hidden: boolean;
}

/** What a path is, its symlinks followed. */
export interface PathStat {
  readonly kind: 'folder' | 'file' | 'other';
}

export class FileSystem extends Context.Service<
  FileSystem,
  {
    /** The user's home folder. */
    readonly home: string;
    /** The entries of the folder at `path`, name-sorted. */
    readonly list: (
      path: string,
    ) => Effect.Effect<
      ReadonlyArray<DirEntry>,
      NotFound | AccessDenied | IoError
    >;
    /** What is at `path`, its symlinks followed. */
    readonly stat: (
      path: string,
    ) => Effect.Effect<PathStat, NotFound | AccessDenied | IoError>;
    /** `path` with every symlink on it resolved; it must be there. */
    readonly realpath: (
      path: string,
    ) => Effect.Effect<string, NotFound | AccessDenied | IoError>;
    /**
     * Makes the folder at `path`, in a folder that is there; with
     * `recursive`, every missing folder on the way too, and a folder there
     * already is no failure.
     */
    readonly mkdir: (
      path: string,
      options?: { readonly recursive?: boolean },
    ) => Effect.Effect<void, NotFound | AccessDenied | AlreadyExists | IoError>;
    /** The bytes of the file at `path`. */
    readonly readFile: (
      path: string,
    ) => Effect.Effect<Uint8Array, NotFound | AccessDenied | IoError>;
    /** Writes the file at `path`, in a folder that is there; text as UTF-8. */
    readonly writeFile: (
      path: string,
      data: Uint8Array | string,
    ) => Effect.Effect<void, NotFound | AccessDenied | IoError>;
    /**
     * Removes what is at `path`, a symlink itself and not what it leads to;
     * a folder only with `recursive`, and all in it. With `force`, nothing
     * there is no failure.
     */
    readonly remove: (
      path: string,
      options?: { readonly recursive?: boolean; readonly force?: boolean },
    ) => Effect.Effect<void, NotFound | AccessDenied | IoError>;
  }
>()('@kestack/connect/engine/FileSystem') {}
