import { mkdir, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Context, Data, Duration, Effect, Layer } from 'effect';
import { Git } from '../../capabilities/index.js';
import {
  expand,
  isDenied,
  isExisting,
  isInside,
  resolveFolder,
} from './home.js';
import { listEntries } from './listing.js';
import { whyNotFolderName } from './name.js';

/*
 * The folders a user may open as Projects: the home folder and everything
 * below it, never anything above. `list` reads one folder's sub-folders
 * the way a picker walks them; `create` makes one new folder in a folder
 * that exists, never its parents, and starts a git repository in it.
 * Every path is checked inside home with its symlinks resolved.
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

/** The most sub-folders one listing holds. */
const LIMIT = 100;

/** How long one listing may take. */
const LIST_TIMEOUT = Duration.seconds(5);

/** One folder's sub-folders, name-sorted, at most 100 of them. */
interface Listing {
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

interface FoldersService {
  /** The sub-folders of `path`; with a query, only the names holding it. */
  readonly list: (input: {
    readonly path: string;
    readonly query?: string | undefined;
  }) => Effect.Effect<
    Listing,
    FolderNotFound | PermissionDenied | OutsideHome | FolderUnreadable
  >;
  /**
   * Makes the folder `name` in `parent` and runs `git init` in it. A git
   * failure keeps the folder and says why in `gitInitError`.
   */
  readonly create: (input: {
    readonly parent: string;
    readonly name: string;
  }) => Effect.Effect<
    { readonly path: string; readonly gitInitError: string | null },
    | FolderNotFound
    | PermissionDenied
    | OutsideHome
    | FolderExists
    | InvalidFolderName
  >;
}

const make = (options: FoldersOptions) =>
  Effect.gen(function* () {
    const git = yield* Git;
    const home = yield* Effect.promise(() =>
      realpath(options.home).catch(() => resolve(options.home)),
    );

    /** The real folder a path the user wrote stands for, inside home. */
    const folderOf = (given: string) =>
      Effect.gen(function* () {
        const path = expand(home, given);
        if (!isInside(home, path)) return yield* new OutsideHome({ path });
        const found = yield* Effect.promise(() => resolveFolder(home, path));
        switch (found._tag) {
          case 'Folder':
            return found.path;
          case 'Outside':
            return yield* new OutsideHome({ path: found.path });
          case 'Denied':
            return yield* new PermissionDenied({ path });
          case 'Missing':
            return yield* new FolderNotFound({ path });
        }
      });

    const list: FoldersService['list'] = ({ path: given, query }) =>
      Effect.gen(function* () {
        const path = yield* folderOf(given);
        const { entries, truncated } = yield* Effect.tryPromise({
          try: () =>
            listEntries({ home, path, query: query ?? '', limit: LIMIT }),
          catch: (error) =>
            isDenied(error)
              ? new PermissionDenied({ path })
              : new FolderUnreadable({ path, message: String(error) }),
        }).pipe(
          Effect.timeoutOrElse({
            duration: LIST_TIMEOUT,
            orElse: () =>
              Effect.fail(
                new FolderUnreadable({
                  path,
                  message: 'Listing it took too long',
                }),
              ),
          }),
        );
        return {
          path,
          parent: path === home ? null : dirname(path),
          folders: entries,
          truncated,
        };
      });

    const create: FoldersService['create'] = ({ parent, name }) =>
      Effect.gen(function* () {
        const reason = whyNotFolderName(name);
        if (reason !== null)
          return yield* new InvalidFolderName({ name, reason });
        const path = join(yield* folderOf(parent), name);
        const failed = yield* Effect.promise(() =>
          mkdir(path).then(
            () => null,
            (error: unknown) => ({ error }),
          ),
        );
        if (failed !== null) {
          if (isExisting(failed.error))
            return yield* new FolderExists({ path });
          if (isDenied(failed.error))
            return yield* new PermissionDenied({ path });
          return yield* Effect.die(failed.error);
        }
        const gitInitError = yield* git.init(path);
        return { path, gitInitError };
      });

    return { list, create } satisfies FoldersService;
  });

/** The home folder's sub-folders, listed and made. */
export class Folders extends Context.Service<Folders, FoldersService>()(
  '@kestack/connect/Folders',
) {
  static readonly layer = (
    options: FoldersOptions,
  ): Layer.Layer<Folders, never, Git> => Layer.effect(Folders, make(options));
}
