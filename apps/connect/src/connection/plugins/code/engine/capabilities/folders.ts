import { Context, Data, type Effect } from 'effect';

/*
 * The folders a user may open as Projects: the home folder and everything
 * below it, never anything above. `list` reads one folder's sub-folders
 * the way a picker walks them; `create` makes one new folder in a folder
 * that exists, never its parents. Every path is checked inside home with
 * its symlinks resolved. The implementation is services/folders/, on this
 * computer's disk.
 */

export class FolderNotFound extends Data.TaggedError('FolderNotFound')<{
  readonly path: string;
}> {}
export class PermissionDenied extends Data.TaggedError('PermissionDenied')<{
  readonly path: string;
}> {}
export class FolderExists extends Data.TaggedError('FolderExists')<{
  readonly path: string;
}> {}
export class InvalidFolderName extends Data.TaggedError('InvalidFolderName')<{
  readonly name: string;
  readonly reason: string;
}> {}
export class OutsideHome extends Data.TaggedError('OutsideHome')<{
  readonly path: string;
}> {}
/** The folder could not be listed: an I/O error, or it took too long. */
export class FolderUnreadable extends Data.TaggedError('FolderUnreadable')<{
  readonly path: string;
  readonly message: string;
}> {}

export interface FoldersOptions {
  /** The folder nothing may leave. */
  readonly home: string;
}

/** One folder's sub-folders, name-sorted, at most 100 of them. */
export interface Listing {
  /** The folder listed, its symlinks resolved. */
  readonly path: string;
  /** The folder above it; null for home. */
  readonly parent: string | null;
  readonly folders: ReadonlyArray<{
    readonly name: string;
    readonly hidden: boolean;
    readonly link: boolean;
  }>;
  /** More folders matched than the listing holds. */
  readonly truncated: boolean;
}

/** The home folder's sub-folders, listed and made. */
export class Folders extends Context.Service<
  Folders,
  {
    /** The sub-folders of `path`; with a query, only the names holding it. */
    readonly list: (input: {
      readonly path: string;
      readonly query?: string | undefined;
    }) => Effect.Effect<
      Listing,
      FolderNotFound | PermissionDenied | OutsideHome | FolderUnreadable
    >;
    /** Makes the folder `name` in `parent`. */
    readonly create: (input: {
      readonly parent: string;
      readonly name: string;
    }) => Effect.Effect<
      { readonly path: string },
      | FolderNotFound
      | PermissionDenied
      | OutsideHome
      | FolderExists
      | InvalidFolderName
    >;
  }
>()('@kestack/connect/Folders') {}
