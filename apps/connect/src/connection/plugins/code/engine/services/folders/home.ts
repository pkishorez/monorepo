import { Effect } from 'effect';
import type { FileSystem } from '../../capabilities/index.js';
import { isWithin } from '../../paths/index.js';

/*
 * Paths inside the home folder. A path is written as the user would: `~`,
 * `~/code`, absolute, or relative to home (paths' `absolute`). It counts as
 * inside only once its symlinks are resolved, so a link never leads out of
 * home.
 */

/** What a path is, its symlinks resolved. */
export type Resolved =
  | { readonly _tag: 'Folder'; readonly path: string }
  | { readonly _tag: 'Missing' }
  | { readonly _tag: 'Denied' }
  | { readonly _tag: 'Outside'; readonly path: string };

/**
 * The folder `path` stands for, if it is one and inside `home` (real).
 * Nothing there, a file, or any failure but AccessDenied is Missing.
 */
export const resolveFolder = (
  files: FileSystem['Service'],
  home: string,
  path: string,
): Effect.Effect<Resolved> =>
  Effect.gen(function* () {
    const real = yield* files.realpath(path);
    if (!isWithin(home, real))
      return { _tag: 'Outside', path: real } satisfies Resolved;
    const found = yield* files.stat(real);
    return found.kind === 'folder'
      ? ({ _tag: 'Folder', path: real } satisfies Resolved)
      : ({ _tag: 'Missing' } satisfies Resolved);
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed<Resolved>(
        error._tag === 'AccessDenied'
          ? { _tag: 'Denied' }
          : { _tag: 'Missing' },
      ),
    ),
  );
