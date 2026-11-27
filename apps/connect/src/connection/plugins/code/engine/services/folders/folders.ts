import { Duration, Effect, Layer } from 'effect';
import {
  FileSystem,
  FolderExists,
  FolderNotFound,
  Folders,
  FolderUnreadable,
  InvalidFolderName,
  OutsideHome,
  PermissionDenied,
} from '../../capabilities/index.js';
import { absolute, dirname, isWithin, join } from '../../paths/index.js';
import { resolveFolder } from './home.js';
import { listEntries } from './listing.js';
import { whyNotFolderName } from './name.js';

/*
 * Folders under the File System's home, over the File System: on this
 * computer's disk or a browser tab's fake alike. Its failures become
 * Folders' own: AccessDenied is PermissionDenied, a listing's IoError is
 * FolderUnreadable, a new folder's AlreadyExists is FolderExists.
 */

/** The most sub-folders one listing holds. */
const LIMIT = 100;

/** How long one listing may take. */
const LIST_TIMEOUT = Duration.seconds(5);

const make = Effect.gen(function* () {
  const files = yield* FileSystem;
  const home = yield* files
    .realpath(files.home)
    .pipe(Effect.orElseSucceed(() => absolute('/', files.home)));

  /** The real folder a path the user wrote stands for, inside home. */
  const folderOf = (given: string) =>
    Effect.gen(function* () {
      const path = absolute(home, given);
      if (!isWithin(home, path)) return yield* new OutsideHome({ path });
      const found = yield* resolveFolder(files, home, path);
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

  const list: Folders['Service']['list'] = ({ path: given, query }) =>
    Effect.gen(function* () {
      const path = yield* folderOf(given);
      const { entries, truncated } = yield* listEntries(files, {
        home,
        path,
        query: query ?? '',
        limit: LIMIT,
      }).pipe(
        Effect.catchTags({
          AccessDenied: () => Effect.fail(new PermissionDenied({ path })),
          NotFound: () => Effect.fail(new FolderNotFound({ path })),
          IoError: ({ message }) =>
            Effect.fail(new FolderUnreadable({ path, message })),
        }),
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

  const create: Folders['Service']['create'] = ({ parent, name }) =>
    Effect.gen(function* () {
      const reason = whyNotFolderName(name);
      if (reason !== null)
        return yield* new InvalidFolderName({ name, reason });
      const path = join(yield* folderOf(parent), name);
      yield* files.mkdir(path).pipe(
        Effect.catchTags({
          AlreadyExists: () => Effect.fail(new FolderExists({ path })),
          AccessDenied: () => Effect.fail(new PermissionDenied({ path })),
          NotFound: () => Effect.fail(new FolderNotFound({ path: parent })),
          IoError: (error) => Effect.die(error),
        }),
      );
      return { path };
    });

  return { list, create } satisfies Folders['Service'];
});

/** Folders under the File System's home. */
export const homeFolders: Layer.Layer<Folders, never, FileSystem> =
  Layer.effect(Folders, make);
