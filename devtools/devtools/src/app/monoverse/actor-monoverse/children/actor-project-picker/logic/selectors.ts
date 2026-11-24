import type { FolderListing } from '../../../../server/rpc/projects/contract/index.js';
import { shownOf, topOf, type Listing, type Model } from './shared/index.js';

// Steps ----------------------------------------------------------------------

export const highlightedOf = (model: Model) =>
  topOf(model)?.highlighted ?? model.highlighted;

export const sameSegments = (
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>,
) => a.length === b.length && a.every((name, at) => name === b[at]);

export const valuesOf = (model: Model) =>
  shownOf(model, null).rows.map(({ value }) => value);

/** The first row now, for `highlighted` to tell a moved highlight from a best one. */
export const firstOf = (model: Model) => valuesOf(model)[0];

/** A listing as the server gave it, for the search it answers. */
export const listingOf = (
  listing: FolderListing,
  query: string,
  hidden: boolean,
): Listing => ({
  query,
  hidden,
  path: listing.path,
  kind: listing.kind,
  folders: listing.folders,
  truncated: listing.truncated,
  problem: null,
});

/** The Project the Recent row `value` is, if it is one. */
export const projectAt = (model: Model, value: string) => {
  const row = shownOf(model, null).rows.find((each) => each.value === value);
  return row?._tag === 'Project' ? row.project : null;
};

// Paths ----------------------------------------------------------------------

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
