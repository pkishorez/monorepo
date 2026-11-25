import { Schema } from 'effect';
import { dirname, join, normalize, partsOf, isWithin } from './paths.js';

/*
 * The fake's tree, as plain data: every entry by its absolute path, `/`
 * included. A folder holds what is below it; a file holds its text, or
 * its bytes as base64. Hidden is only a name starting with `.`. Every
 * function here is pure: the Actor's Updates change the tree with them,
 * and the layer reads it with `resolve`.
 */

/** How a file's data is kept: `utf8` for text as it is, `base64` for other bytes. */
export const Encoding = Schema.Literals(['utf8', 'base64']);

export const Entry = Schema.TaggedUnion({
  Folder: {},
  File: {
    data: Schema.String,
    encoding: Encoding,
  },
});
export type Entry = typeof Entry.Type;

export const Tree = Schema.Record(Schema.String, Entry);
export type Tree = typeof Tree.Type;

export const folder: Entry = { _tag: 'Folder' };

export const textFile = (data: string): Entry => ({
  _tag: 'File',
  data,
  encoding: 'utf8',
});

/** A tree holding only `path` and the folders on the way to it. */
export const treeWith = (path: string): Tree => ensureFolders({}, path);

/**
 * `tree` with a folder at `path` and at every path on the way; what is
 * there already stays, and a file on the way is replaced.
 */
export const ensureFolders = (tree: Tree, path: string): Tree => {
  const next: Record<string, Entry> = { ...tree };
  let at = '/';
  if (next[at]?._tag !== 'Folder') next[at] = folder;
  for (const part of partsOf(path)) {
    at = join(at, part);
    if (next[at]?._tag !== 'Folder') next[at] = folder;
  }
  return next;
};

/** `tree` with `entry` at `path`, the folders on the way made. */
export const put = (tree: Tree, path: string, entry: Entry): Tree => {
  const normal = normalize(path);
  if (normal === '/') return tree;
  const without = remove(tree, normal);
  return { ...ensureFolders(without, dirname(normal)), [normal]: entry };
};

/** `tree` without `path` and all below it; `/` always stays. */
export const remove = (tree: Tree, path: string): Tree => {
  const normal = normalize(path);
  const next = Object.fromEntries(
    Object.entries(tree).filter(([at]) => !isWithin(normal, at)),
  );
  return normal === '/' ? { '/': folder } : next;
};

/** The entries right inside the folder `path`, by name. */
export const childrenOf = (tree: Tree, path: string) => {
  const prefix = path === '/' ? '/' : `${path}/`;
  return Object.entries(tree)
    .filter(
      ([at]) =>
        at !== path &&
        at.startsWith(prefix) &&
        !at.includes('/', prefix.length),
    )
    .map(([at, entry]) => ({ name: at.slice(prefix.length), entry }));
};

/**
 * Where a path leads, as the kernel walks it: each name on the way must be
 * a folder. `Found` is the entry and its path; `Missing` is a path whose
 * folder is there but holds nothing of its name, the path a new entry
 * would take.
 */
export type Resolved =
  | { readonly _tag: 'Found'; readonly path: string; readonly entry: Entry }
  | { readonly _tag: 'Missing'; readonly path: string }
  | { readonly _tag: 'NotFound' };

export const resolve = (tree: Tree, path: string): Resolved => {
  const parts = partsOf(path);
  let at = '/';
  for (const [index, part] of parts.entries()) {
    if (tree[at]?._tag !== 'Folder') return { _tag: 'NotFound' };
    const next = join(at, part);
    const found = tree[next];
    const last = index === parts.length - 1;
    if (found === undefined)
      return last ? { _tag: 'Missing', path: next } : { _tag: 'NotFound' };
    if (last) return { _tag: 'Found', path: next, entry: found };
    at = next;
  }
  return { _tag: 'Found', path: '/', entry: tree['/'] ?? folder };
};
