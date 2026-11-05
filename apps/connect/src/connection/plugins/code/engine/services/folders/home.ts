import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

/*
 * Paths inside the home folder. A path is written as the user would: `~`,
 * `~/code`, absolute, or relative to home. It counts as inside only once
 * its symlinks are resolved, so a link never leads out of home.
 */

/** A path as the user wrote it, made absolute against `home`. */
export const expand = (home: string, path: string) =>
  path === '~'
    ? home
    : path.startsWith('~/')
      ? join(home, path.slice(2))
      : isAbsolute(path)
        ? resolve(path)
        : join(home, path);

/** Whether `path` is `home` or below it; both already absolute. */
export const isInside = (home: string, path: string) => {
  const between = relative(home, path);
  return between === '' || (!between.startsWith('..') && !isAbsolute(between));
};

/** What a path is, its symlinks resolved. */
export type Resolved =
  | { readonly _tag: 'Folder'; readonly path: string }
  | { readonly _tag: 'Missing' }
  | { readonly _tag: 'Denied' }
  | { readonly _tag: 'Outside'; readonly path: string };

const codeOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';

/** Whether a Node error says this user may not. */
export const isDenied = (error: unknown) =>
  ['EACCES', 'EPERM', 'EROFS'].includes(codeOf(error));

export const isExisting = (error: unknown) => codeOf(error) === 'EEXIST';

/** The folder `path` stands for, if it is one and inside `home` (real). */
export const resolveFolder = async (
  home: string,
  path: string,
): Promise<Resolved> => {
  try {
    const real = await realpath(path);
    if (!isInside(home, real)) return { _tag: 'Outside', path: real };
    return (await stat(real)).isDirectory()
      ? { _tag: 'Folder', path: real }
      : { _tag: 'Missing' };
  } catch (error) {
    return isDenied(error) ? { _tag: 'Denied' } : { _tag: 'Missing' };
  }
};
