import { mkdir, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Duration, Effect, Layer } from 'effect';
import {
  FolderExists,
  FolderNotFound,
  Folders,
  FolderUnreadable,
  InvalidFolderName,
  OutsideHome,
  PermissionDenied,
  type FoldersOptions,
} from '../../capabilities/index.js';
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
 * Folders on this computer's disk, under home, over `node:fs`: Node only,
 * so engine/node.ts gives it, until it runs over the File System edge.
 */

/** The most sub-folders one listing holds. */
const LIMIT = 100;

/** How long one listing may take. */
const LIST_TIMEOUT = Duration.seconds(5);

const make = (options: FoldersOptions) =>
  Effect.gen(function* () {
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

    const list: Folders['Service']['list'] = ({ path: given, query }) =>
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

    const create: Folders['Service']['create'] = ({ parent, name }) =>
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
        return { path };
      });

    return { list, create } satisfies Folders['Service'];
  });

/** Folders under `options.home` on this computer's disk. */
export const nodeFolders = (options: FoldersOptions): Layer.Layer<Folders> =>
  Layer.effect(Folders, make(options));
