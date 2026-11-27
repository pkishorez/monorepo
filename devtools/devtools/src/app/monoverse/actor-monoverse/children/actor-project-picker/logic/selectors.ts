import type { FolderListing } from '../../../../server/rpc/projects/contract/index.js';
import { shownOf, topOf, type Listing, type Model } from './shared/index.js';

export const highlightedOf = (model: Model) =>
  topOf(model)?.highlighted ?? model.highlighted;

export const sameSegments = (
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>,
) => a.length === b.length && a.every((name, at) => name === b[at]);

export const valuesOf = (model: Model) =>
  shownOf(model, null).rows.map(({ value }) => value);

export const firstOf = (model: Model) => valuesOf(model)[0];

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

export const projectAt = (model: Model, value: string) => {
  const row = shownOf(model, null).rows.find((each) => each.value === value);
  return row?._tag === 'Project' ? row.project : null;
};

export const basename = (path: string) =>
  path.split('/').filter(Boolean).pop() ?? path;

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
