/*
 * Folders under home, as the folder Steps keep them: a list of names below
 * home, never above it. A path typed in the search goes to the folder it
 * names: from home with `~/` (or the home folder written out), from the
 * folder open otherwise, `..` going up; what follows the last `/` is left
 * to search there.
 */

/** The last segment of a path. */
export const basename = (path: string) =>
  path.split('/').filter(Boolean).pop() ?? path;

/** A path under home, written from `~`; others as they are. */
export function tilde(path: string, home: string | null): string {
  if (home !== null) {
    if (path === home) return '~';
    return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
  }
  // Before the server has said where home is: the usual places.
  const match = /^\/Users\/[^/]+|^\/home\/[^/]+/.exec(path);
  return match ? `~${path.slice(match[0].length)}` : path;
}

/** The absolute folder `segments` below home. */
export const absolute = (home: string, segments: ReadonlyArray<string>) =>
  segments.length === 0 ? home : `${home}/${segments.join('/')}`;

/**
 * Where a typed path goes, from the folder `segments`: the folders below
 * home it names and what is left to search. Null for text with no `/`, or
 * a path from `/` outside home, which names no folder here.
 */
export function walk(
  segments: ReadonlyArray<string>,
  query: string,
  home: string | null,
): { readonly segments: ReadonlyArray<string>; readonly query: string } | null {
  if (!query.includes('/')) return null;
  let rest: string;
  let from: Array<string>;
  if (query.startsWith('~/')) {
    rest = query.slice(2);
    from = [];
  } else if (query.startsWith('/')) {
    if (home === null || !(query === home || query.startsWith(`${home}/`)))
      return null;
    rest = query.slice(home.length + 1);
    from = [];
  } else {
    rest = query;
    from = [...segments];
  }
  const parts = rest.split('/');
  const left = parts.pop() ?? '';
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') from.pop();
    else from.push(part);
  }
  return { segments: from, query: left };
}

/** Whether a search asks for hidden folders: it starts with a `.`. */
export const hiddenOf = (query: string) => query.trim().startsWith('.');
